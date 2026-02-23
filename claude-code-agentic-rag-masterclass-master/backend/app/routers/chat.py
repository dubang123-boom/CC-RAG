from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse
from app.dependencies import get_current_user, get_supabase_client
from app.models.chat import ConversationCreate, ConversationResponse, MessageCreate, MessageResponse
from app.services.openai_service import create_response_stream
import json

router = APIRouter()


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
async def send_message(conversation_id: str, body: MessageCreate, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()

    # Verify conversation ownership
    conv = supabase.table("conversations").select("*").eq("id", conversation_id).eq("user_id", user["id"]).single().execute()
    if not conv.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    supabase.table("messages").insert({
        "conversation_id": conversation_id,
        "user_id": user["id"],
        "role": "user",
        "content": body.content,
    }).execute()

    previous_response_id = conv.data.get("openai_response_id")

    async def event_generator():
        full_response = ""
        response_id = None

        try:
            stream = create_response_stream(body.content, previous_response_id)

            for event in stream:
                if event.type == "response.output_text.delta":
                    full_response += event.delta
                    yield {"event": "message", "data": json.dumps({"type": "delta", "content": event.delta})}
                elif event.type == "response.completed":
                    response_id = event.response.id

            # Save assistant message
            supabase.table("messages").insert({
                "conversation_id": conversation_id,
                "user_id": user["id"],
                "role": "assistant",
                "content": full_response,
            }).execute()

            # Update conversation with response_id
            update_data = {"openai_response_id": response_id}

            # Auto-generate title from first user message
            if conv.data.get("title") == "New Conversation":
                title = body.content[:50]
                if len(body.content) > 50:
                    title += "..."
                update_data["title"] = title

            supabase.table("conversations").update(update_data).eq("id", conversation_id).execute()

            yield {"event": "message", "data": json.dumps({"type": "done", "response_id": response_id})}
        except Exception as e:
            yield {"event": "message", "data": json.dumps({"type": "error", "content": str(e)})}

    return EventSourceResponse(event_generator())
