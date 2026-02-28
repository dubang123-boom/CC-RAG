import logging
from pydantic import BaseModel, Field
from app.services.llm_service import get_llm_client
from app.config import settings

logger = logging.getLogger(__name__)


class SubQueryPlan(BaseModel):
    sub_queries: list[str] = Field(
        description=(
            "1 to 3 focused search queries that together cover the user's question. "
            "Each query should be specific enough to retrieve distinct evidence. "
            "If the question is simple, return exactly 1 query. Maximum 3 queries."
        ),
    )
    reasoning: str = Field(
        description="Brief explanation of why you split the question this way (1-2 sentences).",
    )


_DECOMPOSE_PROMPT = (
    "You are a search strategist for a document retrieval system. "
    "Decompose a user's question into 1-3 focused search queries.\n\n"
    "Rules:\n"
    "- Simple, single-topic questions → 1 query (just rephrase for search)\n"
    "- Multi-part questions → 2-3 queries, one per distinct concept\n"
    "- Comparative questions → one query per entity being compared\n"
    "- Each query should be a concise noun phrase or short question\n"
    "- Queries must be semantically distinct to avoid redundant retrieval\n"
    "- Maximum 3 sub-queries total."
)


def decompose_query(question: str) -> SubQueryPlan:
    """
    Use LLM structured output to decompose a user question into 1-3 sub-queries.
    Falls back to [question] on any error.
    """
    client = get_llm_client()
    try:
        response = client.beta.chat.completions.parse(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": _DECOMPOSE_PROMPT},
                {"role": "user", "content": question},
            ],
            response_format=SubQueryPlan,
        )
        plan = response.choices[0].message.parsed
        plan.sub_queries = plan.sub_queries[:3]  # enforce max 3
        if not plan.sub_queries:
            plan.sub_queries = [question]
            plan.reasoning = "No sub-queries generated; using original query."
        return plan
    except Exception:
        logger.warning("Query decomposition failed", exc_info=True)
        return SubQueryPlan(
            sub_queries=[question],
            reasoning="Decomposition unavailable; using original query.",
        )
