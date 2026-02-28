from app.services.llm_service import get_llm_client
from app.models.chat import ConversationSummary
from app.config import settings


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: characters / 4."""
    return len(text) // 4


def maybe_compress_history(
    conversation_id: str,
    messages: list[dict],
    user_id: str,
    supabase,
) -> list[dict]:
    """
    If conversation history exceeds MAX_HISTORY_TOKENS, compress older messages
    into a summary and keep only the most recent ones verbatim.
    """
    total_text = "".join(m.get("content", "") or "" for m in messages)
    total_tokens = _estimate_tokens(total_text)

    if total_tokens <= settings.MAX_HISTORY_TOKENS:
        return messages

    keep = settings.RECENT_MESSAGES_KEEP
    recent = messages[-keep:] if len(messages) > keep else messages
    older = messages[:-keep] if len(messages) > keep else []

    if not older:
        return messages

    # Generate summary of older messages
    summary_text = _summarize_messages(older)
    if not summary_text:
        # Fallback: just keep recent messages
        return recent

    # Persist summary
    try:
        supabase.table("conversations").update({"summary": summary_text}) \
            .eq("id", conversation_id).eq("user_id", user_id).execute()
    except Exception:
        pass

    return [
        {"role": "system", "content": f"[Conversation summary]\n{summary_text}"},
    ] + recent


def _summarize_messages(messages: list[dict]) -> str | None:
    """Use LLM to summarize a list of messages."""
    client = get_llm_client()
    conversation_text = "\n".join(
        f"{m.get('role', 'unknown')}: {m.get('content', '')}" for m in messages
    )
    try:
        response = client.beta.chat.completions.parse(
            model=settings.LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize the following conversation concisely, preserving key facts, "
                        "decisions, and context needed to continue the conversation coherently. "
                        "Write in third person."
                    ),
                },
                {"role": "user", "content": conversation_text},
            ],
            response_format=ConversationSummary,
        )
        result = response.choices[0].message.parsed
        return result.summary
    except Exception:
        return None
