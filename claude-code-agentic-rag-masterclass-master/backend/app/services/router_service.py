import logging
from typing import Literal
from pydantic import BaseModel, Field
from app.services.llm_service import get_llm_client
from app.config import settings

logger = logging.getLogger(__name__)


class QueryRoute(BaseModel):
    route: Literal["retrieval", "web_search", "sql_query", "general"] = Field(
        description="The best tool pipeline to answer this question.",
    )
    reasoning: str = Field(
        description="Brief explanation of why this route was chosen (1 sentence).",
    )


def _build_router_prompt(has_documents: bool) -> str:
    routes: list[str] = []

    if has_documents:
        routes.append(
            "- retrieval: Questions about the content of user-uploaded documents "
            "(articles, manuals, reports, images). Choose this when the user asks "
            "about something that could be in their document library."
        )

    if settings.TAVILY_API_KEY:
        routes.append(
            "- web_search: Questions about current events, real-time information, "
            "external knowledge, or anything not covered by uploaded documents."
        )

    if has_documents and settings.SQL_QUERY_ENABLED:
        routes.append(
            "- sql_query: Questions about document library metadata — file counts, "
            "file names, languages, document types, upload dates. NOT about document "
            "content itself."
        )

    routes.append(
        "- general: Greetings, casual chat, vague questions, or anything that "
        "doesn't fit the above categories."
    )

    doubt_hint = (
        "When in doubt and documents are available, prefer 'retrieval'. "
        "Only choose 'general' for unambiguous greetings or casual small talk."
        if has_documents else
        "When in doubt, prefer 'general'."
    )
    return (
        "You are a query router. Classify the user's question into exactly one route.\n\n"
        "Available routes:\n"
        + "\n".join(routes)
        + f"\n\nChoose the single best route. {doubt_hint}"
    )


def route_query(question: str, has_documents: bool) -> QueryRoute:
    """
    Use LLM structured output to classify a question into a tool route.
    Falls back to 'retrieval' (when documents exist) or 'general' on any error.
    """
    import json as _json
    client = get_llm_client()
    try:
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": _build_router_prompt(has_documents) + (
                        '\n\nRespond with a JSON object only, no markdown, using this exact schema:\n'
                        '{"route": "<one of the available route names>", "reasoning": "<one sentence>"}'
                    ),
                },
                {"role": "user", "content": question},
            ],
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""
        data = _json.loads(raw)
        route = QueryRoute(**data)

        # Guard against unavailable routes
        if route.route == "web_search" and not settings.TAVILY_API_KEY:
            return QueryRoute(route="general", reasoning="Web search unavailable (no API key).")
        if route.route == "retrieval" and not has_documents:
            return QueryRoute(route="general", reasoning="No documents available for retrieval.")
        if route.route == "sql_query" and (not has_documents or not settings.SQL_QUERY_ENABLED):
            return QueryRoute(route="general", reasoning="SQL query unavailable.")

        return route
    except Exception:
        logger.warning("Query routing failed", exc_info=True)
        if has_documents:
            return QueryRoute(route="retrieval", reasoning="Router unavailable; defaulting to retrieval since documents exist.")
        return QueryRoute(route="general", reasoning="Router unavailable; defaulting to general.")
