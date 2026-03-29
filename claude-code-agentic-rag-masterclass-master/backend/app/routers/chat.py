from fastapi import APIRouter, Depends, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from app.dependencies import get_current_user, get_supabase_client
from app.models.chat import ConversationCreate, MessageCreate
from app.services.llm_service import create_chat_stream_with_tools, build_user_llm_client
from app.services.retrieval_service import retrieve_chunks
from app.services.decompose_service import decompose_query
from app.services.reflection_service import reflect_on_answer
from app.services.memory_service import extract_memories, save_memories, get_user_memories, format_memories_for_prompt
from app.services.summary_service import maybe_compress_history
from app.services.router_service import route_query, QueryRoute
from app.services.tavily_service import search_web, format_search_results_for_llm
from app.services.sql_service import generate_sql, execute_sql, format_sql_results_for_llm
from app.config import settings
from app.rate_limit import limiter
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

_IMAGE_TYPES = {"jpg", "jpeg", "png", "gif", "webp", "tiff", "bmp"}


@router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    result = supabase.table("conversations").select("*").eq("user_id", user["id"]).order("updated_at", desc=True).execute()
    return result.data


@router.post("/conversations")
async def create_conversation(body: ConversationCreate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    result = supabase.table("conversations").insert({
        "user_id": user["id"],
        "title": body.title,
    }).execute()
    return result.data[0]


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    conv = supabase.table("conversations").select("*").eq("id", conversation_id).eq("user_id", user["id"]).single().execute()
    messages = supabase.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at").execute()
    return {**conv.data, "messages": messages.data}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    supabase.table("conversations").delete().eq("id", conversation_id).eq("user_id", user["id"]).execute()
    return {"message": "Deleted"}


@router.post("/conversations/{conversation_id}/messages")
@limiter.limit("10/minute")
async def send_message(request: Request, conversation_id: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()

    # Verify conversation ownership
    conv = supabase.table("conversations").select("*") \
        .eq("id", conversation_id).eq("user_id", user["id"]).single().execute()
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": user["id"],
        "role": "user",
        "content": body.content,
    }).execute()

    # Fetch full conversation history
    history = supabase.table("messages").select("role, content") \
        .eq("conversation_id", conversation_id).order("created_at").execute()
    messages = [{"role": m["role"], "content": m["content"]} for m in history.data]

    # A) History compression
    messages = maybe_compress_history(conversation_id, messages, user["id"], supabase)

    # B) Memory injection
    user_memories = get_user_memories(user["id"], supabase)
    memory_context = format_memories_for_prompt(user_memories)

    # Check if user has at least one complete document
    doc_check = supabase.table("documents").select("id") \
        .eq("user_id", user["id"]).eq("status", "complete").limit(1).execute()
    has_documents = len(doc_check.data) > 0

    async def event_generator():
        full_response = ""
        tool_content = ""

        try:
            # ── Load user LLM settings ───────────────────────────────────────
            user_llm = supabase.table("user_settings").select("*").eq("user_id", user["id"]).maybe_single().execute()
            u = user_llm.data or {}
            _api_key = u.get("llm_api_key") or settings.LLM_API_KEY
            _base_url = u.get("llm_base_url") or settings.LLM_BASE_URL
            _model = u.get("llm_model") or settings.LLM_MODEL
            _sys_prompt = u.get("llm_system_prompt") or None  # None → use SYSTEM_PROMPT default
            llm_client = build_user_llm_client(_api_key, _base_url)

            # ── Route the query ─────────────────────────────────────────────
            route = await asyncio.to_thread(route_query, body.content, has_documents)

            # Safety override: when documents exist, never skip retrieval.
            # If retrieval returns nothing relevant, the LLM handles it gracefully.
            if route.route == "general" and has_documents:
                logger.info(
                    "Router chose 'general' but documents exist; overriding to 'retrieval'. "
                    "Original reasoning: %s", route.reasoning,
                )
                route = QueryRoute(
                    route="retrieval",
                    reasoning="Safety override: documents available, forcing retrieval.",
                )

            yield {"event": "message", "data": json.dumps({
                "type": "route",
                "route": route.route,
                "reasoning": route.reasoning,
            })}

            # ── Route: retrieval (existing pipeline) ────────────────────────
            if route.route == "retrieval":
                # Stage 1: Decompose question into sub-queries
                plan = await asyncio.to_thread(decompose_query, body.content)
                yield {"event": "message", "data": json.dumps({
                    "type": "decompose",
                    "sub_queries": plan.sub_queries,
                    "reasoning": plan.reasoning,
                })}

                # Stage 2: Retrieve per sub-query, deduplicate by chunk_id
                seen_chunk_ids: set[str] = set()
                all_results = []

                for sub_query in plan.sub_queries:
                    yield {"event": "message", "data": json.dumps({
                        "type": "tool_call",
                        "tool": "retrieve_documents",
                        "query": sub_query,
                    })}

                    results = await asyncio.to_thread(retrieve_chunks, sub_query, user["id"], supabase)
                    new_results = [r for r in results if r.chunk_id not in seen_chunk_ids]
                    for r in new_results:
                        seen_chunk_ids.add(r.chunk_id)
                    all_results.extend(new_results)

                    yield {"event": "message", "data": json.dumps({
                        "type": "tool_result",
                        "content": f"Found {len(new_results)} new chunk(s) for: \"{sub_query}\"",
                    })}

                # Stage 3: Build merged evidence pool
                if all_results:
                    all_results.sort(key=lambda r: r.similarity, reverse=True)

                    doc_ids = list({r.document_id for r in all_results})
                    doc_rows = supabase.table("documents").select("id, filename, file_type") \
                        .in_("id", doc_ids).execute()
                    doc_info = {d["id"]: d for d in (doc_rows.data or [])}

                    def _format_excerpt(i: int, r) -> str:
                        doc = doc_info.get(r.document_id, {})
                        filename = doc.get("filename", "unknown")
                        file_type = doc.get("file_type", "")
                        label = (
                            f"Image '{filename}' (OCR-extracted text)"
                            if file_type in _IMAGE_TYPES
                            else f"Document '{filename}'"
                        )
                        return f"[Excerpt {i+1}, source={label}, similarity={r.similarity:.2f}]\n{r.content}"

                    tool_content = "\n\n".join(_format_excerpt(i, r) for i, r in enumerate(all_results))
                else:
                    tool_content = "No relevant documents found."

                # Inject evidence via synthetic tool message
                synthetic_id = "synthetic_retrieve_documents_0"
                loop_messages = list(messages) + [
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": synthetic_id,
                            "type": "function",
                            "function": {
                                "name": "retrieve_documents",
                                "arguments": json.dumps({"query": body.content}),
                            },
                        }],
                    },
                    {"role": "tool", "tool_call_id": synthetic_id, "content": tool_content},
                ]
                stream = create_chat_stream_with_tools(loop_messages, tools=None, extra_system_context=memory_context, client=llm_client, model=_model, system_prompt=_sys_prompt)

            # ── Route: web_search ───────────────────────────────────────────
            elif route.route == "web_search":
                yield {"event": "message", "data": json.dumps({
                    "type": "tool_call",
                    "tool": "search_web",
                    "query": body.content,
                })}

                web_results = await asyncio.to_thread(search_web, body.content)
                tool_content = format_search_results_for_llm(web_results)

                yield {"event": "message", "data": json.dumps({
                    "type": "tool_result",
                    "content": f"Found {len(web_results)} web result(s)",
                    "data": {
                        "tool": "search_web",
                        "results": [
                            {"title": r.title, "url": r.url, "snippet": r.content[:200]}
                            for r in web_results
                        ],
                    },
                })}

                synthetic_id = "synthetic_search_web_0"
                loop_messages = list(messages) + [
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": synthetic_id,
                            "type": "function",
                            "function": {
                                "name": "search_web",
                                "arguments": json.dumps({"query": body.content}),
                            },
                        }],
                    },
                    {"role": "tool", "tool_call_id": synthetic_id, "content": tool_content},
                ]
                stream = create_chat_stream_with_tools(loop_messages, tools=None, extra_system_context=memory_context, client=llm_client, model=_model, system_prompt=_sys_prompt)

            # ── Route: sql_query ────────────────────────────────────────────
            elif route.route == "sql_query":
                yield {"event": "message", "data": json.dumps({
                    "type": "tool_call",
                    "tool": "query_documents_metadata",
                    "query": body.content,
                })}

                generated = await asyncio.to_thread(generate_sql, body.content)
                if generated:
                    sql_result = await asyncio.to_thread(execute_sql, generated, user["id"], supabase)
                    tool_content = format_sql_results_for_llm(generated, sql_result)

                    yield {"event": "message", "data": json.dumps({
                        "type": "tool_result",
                        "content": f"Query returned {sql_result.get('count', 0)} row(s)" if sql_result["success"] else f"Query error: {sql_result.get('error', '')}",
                        "data": {
                            "tool": "query_documents_metadata",
                            "sql": generated.sql,
                            "reasoning": generated.reasoning,
                            "success": sql_result["success"],
                            "count": sql_result.get("count", 0),
                        },
                    })}
                else:
                    tool_content = "Failed to generate a SQL query for this question."
                    yield {"event": "message", "data": json.dumps({
                        "type": "tool_result",
                        "content": "Failed to generate query",
                    })}

                synthetic_id = "synthetic_query_documents_metadata_0"
                loop_messages = list(messages) + [
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [{
                            "id": synthetic_id,
                            "type": "function",
                            "function": {
                                "name": "query_documents_metadata",
                                "arguments": json.dumps({"query": body.content}),
                            },
                        }],
                    },
                    {"role": "tool", "tool_call_id": synthetic_id, "content": tool_content},
                ]
                stream = create_chat_stream_with_tools(loop_messages, tools=None, extra_system_context=memory_context, client=llm_client, model=_model, system_prompt=_sys_prompt)

            # ── Route: general ──────────────────────────────────────────────
            else:
                stream = create_chat_stream_with_tools(list(messages), tools=None, extra_system_context=memory_context, client=llm_client, model=_model, system_prompt=_sys_prompt)

            # ── Stream the synthesized answer ───────────────────────────────
            for chunk in stream:
                choice = chunk.choices[0]
                if choice.delta.content:
                    full_response += choice.delta.content
                    yield {"event": "message", "data": json.dumps({
                        "type": "delta",
                        "content": choice.delta.content,
                    })}

            # ── Self-reflection (retrieval route only) ──────────────────────
            if route.route == "retrieval" and full_response:
                reflection = await asyncio.to_thread(
                    reflect_on_answer,
                    question=body.content,
                    evidence=tool_content,
                    answer=full_response,
                )
                yield {"event": "message", "data": json.dumps({
                    "type": "reflect",
                    "confidence": reflection.confidence,
                    "note": reflection.note,
                })}

            # ── Save & auto-title ───────────────────────────────────────────
            if full_response:
                supabase.table("messages").insert({
                    "conversation_id": conversation_id,
                    "user_id": user["id"],
                    "role": "assistant",
                    "content": full_response,
                }).execute()

            # C) Memory extraction
            if settings.MEMORY_EXTRACTION_ENABLED and full_response:
                try:
                    new_memories = extract_memories(body.content, full_response)
                    save_memories(new_memories, user["id"], conversation_id, supabase)
                except Exception:
                    logger.warning("Memory extraction failed", exc_info=True)

            if conv.data.get("title") == "New Conversation" and full_response:
                title = body.content[:50] + ("..." if len(body.content) > 50 else "")
                supabase.table("conversations").update({"title": title}) \
                    .eq("id", conversation_id).execute()

            yield {"event": "message", "data": json.dumps({"type": "done"})}

        except Exception as e:
            logger.exception("SSE generator error")
            yield {"event": "message", "data": json.dumps({"type": "error", "content": str(e)})}

    return EventSourceResponse(event_generator())
