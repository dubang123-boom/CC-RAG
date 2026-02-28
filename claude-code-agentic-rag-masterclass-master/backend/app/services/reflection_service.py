from typing import Literal
from pydantic import BaseModel, Field
from app.services.llm_service import get_llm_client
from app.config import settings


class ReflectionResult(BaseModel):
    confidence: Literal["high", "medium", "low"] = Field(
        description=(
            "high: answer is well-supported by retrieved evidence. "
            "medium: partially supported; some gaps or inferences exist. "
            "low: evidence is absent, irrelevant, or contradicts the answer."
        )
    )
    note: str = Field(
        description=(
            "One sentence explaining the confidence level. "
            "If low or medium, state what is missing or uncertain."
        ),
    )


_REFLECT_PROMPT = (
    "You are a critical evaluator for a RAG (retrieval-augmented generation) system. "
    "Given a user question, the retrieved document evidence, and a draft answer, "
    "assess how well the answer is grounded in the evidence.\n\n"
    "Rules:\n"
    "- high: all key claims in the answer are directly backed by the evidence\n"
    "- medium: most claims are supported, but some details are inferred or missing\n"
    "- low: the evidence is absent, irrelevant, or contradicts the answer\n"
    "\nBe concise and critical. Do not be overly generous with 'high'."
)

_MAX_EVIDENCE_CHARS = 3000
_MAX_ANSWER_CHARS = 1000


def reflect_on_answer(question: str, evidence: str, answer: str) -> ReflectionResult:
    """
    Ask the LLM to rate how well the generated answer is supported by the retrieved evidence.
    Falls back to medium confidence on any error.
    """
    client = get_llm_client()
    user_msg = (
        f"Question: {question}\n\n"
        f"Retrieved evidence:\n{evidence[:_MAX_EVIDENCE_CHARS]}\n\n"
        f"Draft answer:\n{answer[:_MAX_ANSWER_CHARS]}"
    )
    try:
        response = client.beta.chat.completions.parse(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": _REFLECT_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            response_format=ReflectionResult,
        )
        return response.choices[0].message.parsed
    except Exception:
        return ReflectionResult(confidence="medium", note="Reflection unavailable.")
