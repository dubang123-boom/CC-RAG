import os
from openai import OpenAI
from app.config import settings

_llm_client: OpenAI | None = None
_embedding_client: OpenAI | None = None

SYSTEM_PROMPT = (
    "You are a helpful assistant. "
    "Relevant information (from the user's documents, web searches, or database queries) "
    "is automatically retrieved by the system and injected into the conversation before you respond. "
    "When document excerpts are provided in the context, answer based on those excerpts and cite "
    "the source document names. "
    "If the retrieved content says 'No relevant documents found', acknowledge that and answer from "
    "general knowledge if possible, or ask the user to clarify. "
    "When web search results are provided, cite the source URLs in your answer. "
    "When document metadata query results are provided, present them clearly. "
    "Never say you are 'about to search' or 'will look up' documents — retrieval is already done."
)

RETRIEVAL_TOOL = {
    "type": "function",
    "function": {
        "name": "retrieve_documents",
        "description": (
            "Search the user's imported documents for information relevant to the query. "
            "Use this tool when the user's question might be answered by their uploaded documents. "
            "Returns text excerpts ranked by relevance. "
            "Optionally filter by language (ISO 639-1 code, e.g. 'en', 'zh') or "
            "document_type ('article', 'manual', 'report', 'other') when the user "
            "explicitly requests a specific language or document type."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query to find relevant document excerpts",
                },
                "language": {
                    "type": "string",
                    "description": (
                        "ISO 639-1 language code to filter results "
                        "(e.g. 'en', 'zh'). Only set when user specifies a language."
                    ),
                },
                "document_type": {
                    "type": "string",
                    "enum": ["article", "manual", "report", "other"],
                    "description": (
                        "Filter to documents of this type. "
                        "Only set when user specifies a document type."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}


def build_user_llm_client(api_key: str, base_url: str) -> OpenAI:
    """Build a per-request OpenAI-compatible client using user-provided credentials."""
    return _build_client(api_key, base_url)


def _build_client(api_key: str, base_url: str) -> OpenAI:
    """Build an OpenAI-compatible client for any provider, with optional LangSmith tracing."""
    os.environ.setdefault("LANGSMITH_TRACING", str(settings.LANGSMITH_TRACING).lower())
    if settings.LANGSMITH_API_KEY:
        os.environ.setdefault("LANGSMITH_API_KEY", settings.LANGSMITH_API_KEY)
        os.environ.setdefault("LANGSMITH_PROJECT", settings.LANGSMITH_PROJECT)

    client = OpenAI(api_key=api_key, base_url=base_url, timeout=settings.LLM_TIMEOUT)

    if settings.LANGSMITH_API_KEY:
        try:
            from langsmith.wrappers import wrap_openai
            client = wrap_openai(client)
        except ImportError:
            pass

    return client


def get_llm_client() -> OpenAI:
    global _llm_client
    if _llm_client is None:
        _llm_client = _build_client(settings.LLM_API_KEY, settings.LLM_BASE_URL)
    return _llm_client


def get_embedding_client() -> OpenAI:
    global _embedding_client
    if _embedding_client is None:
        _embedding_client = _build_client(
            settings.effective_embedding_api_key,
            settings.effective_embedding_base_url,
        )
    return _embedding_client


def create_chat_stream(
    messages: list[dict],
    system_prompt: str | None = None,
    extra_system_context: str = "",
):
    """
    Streaming Chat Completions without tools (plain conversation).
    """
    client = get_llm_client()
    all_messages = []
    prompt = system_prompt or ""
    if extra_system_context:
        prompt = (prompt + "\n\n" + extra_system_context).strip()
    if prompt:
        all_messages.append({"role": "system", "content": prompt})
    all_messages.extend(messages)

    return client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=all_messages,
        stream=True,
    )


def create_chat_stream_with_tools(
    messages: list[dict],
    tools: list[dict] | None = None,
    extra_system_context: str = "",
    client: OpenAI | None = None,
    model: str | None = None,
    system_prompt: str | None = None,
):
    """
    Streaming Chat Completions with optional tool definitions.
    Prepends SYSTEM_PROMPT (or system_prompt override). Returns the raw stream object.
    """
    llm = client or get_llm_client()
    base_prompt = system_prompt if system_prompt is not None else SYSTEM_PROMPT
    system_content = base_prompt
    if extra_system_context:
        system_content = system_content + "\n\n" + extra_system_context
    all_messages = [{"role": "system", "content": system_content}] + messages
    kwargs: dict = {
        "model": model or settings.LLM_MODEL,
        "messages": all_messages,
        "stream": True,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    return llm.chat.completions.create(**kwargs)
