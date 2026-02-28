import logging

from app.services.llm_service import get_llm_client
from app.models.chat import MemoryExtraction
from app.config import settings

logger = logging.getLogger(__name__)


_EXTRACTION_PROMPT = (
    "You are a memory extraction assistant. Given a user message and assistant response, "
    "extract important, long-lasting facts, preferences, or instructions about the user.\n\n"
    "Rules:\n"
    "- Only extract information that would be useful in future conversations\n"
    "- Focus on: personal facts (name, job, location), preferences (likes, dislikes), "
    "and instructions (how the user wants to be addressed, communication style)\n"
    "- Do NOT extract transient or conversational content\n"
    "- Return an empty list if nothing worth remembering\n"
    "- Maximum 3 memories per exchange\n"
    "- Each memory should be a concise, standalone statement"
)


def extract_memories(user_message: str, assistant_response: str) -> list[str]:
    """Extract memorable facts from a user-assistant exchange."""
    client = get_llm_client()
    try:
        response = client.beta.chat.completions.parse(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": _EXTRACTION_PROMPT},
                {"role": "user", "content": (
                    f"User message: {user_message}\n\n"
                    f"Assistant response: {assistant_response}"
                )},
            ],
            response_format=MemoryExtraction,
        )
        result = response.choices[0].message.parsed
        return result.memories[:3]
    except Exception:
        return []


def save_memories(
    memories: list[str],
    user_id: str,
    conversation_id: str,
    supabase,
) -> None:
    """Save extracted memories, deduplicating against existing ones."""
    if not memories:
        return

    try:
        existing = supabase.table("memories").select("content") \
            .eq("user_id", user_id).execute()
        existing_lower = {m["content"].lower() for m in (existing.data or [])}

        new_memories = [m for m in memories if m.lower() not in existing_lower]
        if not new_memories:
            return

        rows = [
            {
                "user_id": user_id,
                "content": m,
                "category": "fact",
                "source_conversation_id": conversation_id,
            }
            for m in new_memories
        ]
        supabase.table("memories").insert(rows).execute()
    except Exception:
        logger.warning("Failed to save memories", exc_info=True)


def get_user_memories(user_id: str, supabase, limit: int = 20) -> list[dict]:
    """Fetch user's memories ordered by most recently updated."""
    try:
        result = supabase.table("memories").select("*") \
            .eq("user_id", user_id) \
            .order("updated_at", desc=True) \
            .limit(limit).execute()
        return result.data or []
    except Exception:
        logger.warning("Failed to fetch user memories", exc_info=True)
        return []


def format_memories_for_prompt(memories: list[dict]) -> str:
    """Format memories as context to inject into system prompt."""
    if not memories:
        return ""
    lines = [f"- {m['content']}" for m in memories]
    return "## User Memories\n" + "\n".join(lines)
