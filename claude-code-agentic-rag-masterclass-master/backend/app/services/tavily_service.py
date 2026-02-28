import logging
from dataclasses import dataclass
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class WebSearchResult:
    title: str
    url: str
    content: str
    score: float


def search_web(query: str) -> list[WebSearchResult]:
    """
    Search the web using Tavily. Returns empty list if no API key or on error.
    """
    if not settings.TAVILY_API_KEY:
        return []

    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=settings.TAVILY_API_KEY)
        response = client.search(
            query=query,
            max_results=settings.TAVILY_MAX_RESULTS,
            search_depth="basic",
        )
        return [
            WebSearchResult(
                title=r.get("title", ""),
                url=r.get("url", ""),
                content=r.get("content", ""),
                score=r.get("score", 0.0),
            )
            for r in response.get("results", [])
        ]
    except Exception:
        logger.warning("Web search failed", exc_info=True)
        return []


def format_search_results_for_llm(results: list[WebSearchResult]) -> str:
    """Format web search results for injection into LLM context."""
    if not results:
        return "No web search results found."

    parts = []
    for i, r in enumerate(results):
        parts.append(
            f"[Web Result {i + 1}]\n"
            f"Title: {r.title}\n"
            f"URL: {r.url}\n"
            f"Content: {r.content}"
        )
    return "\n\n".join(parts)
