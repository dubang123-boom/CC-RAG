from typing import Literal
from pydantic import BaseModel
from app.services.llm_service import get_llm_client
from app.config import settings


class DocumentMetadata(BaseModel):
    title: str
    summary: str
    language: str          # ISO 639-1 code, e.g. "en", "zh"
    topics: list[str]      # 3-7 short topic tags
    document_type: Literal["article", "manual", "report", "other"]


_MAX_CHARS = 4000

_EXTRACTION_PROMPT = (
    "You are a document analyst. Extract structured metadata from the document excerpt below.\n\n"
    "Rules:\n"
    "- title: infer from content if not explicit; use the filename as fallback\n"
    "- summary: 1-2 sentences describing what the document is about\n"
    "- language: ISO 639-1 two-letter code (e.g. 'en', 'zh', 'fr')\n"
    "- topics: 3 to 7 short lowercase topic tags\n"
    "- document_type: one of 'article', 'manual', 'report', 'other'\n\n"
    "Respond ONLY with valid JSON matching the schema. No explanation."
)


def extract_metadata(text: str, filename: str) -> DocumentMetadata:
    client = get_llm_client()
    excerpt = text[:_MAX_CHARS]
    user_message = f"Filename: {filename}\n\nDocument excerpt:\n{excerpt}"

    response = client.beta.chat.completions.parse(
        model=settings.LLM_MODEL,
        messages=[
            {"role": "system", "content": _EXTRACTION_PROMPT},
            {"role": "user", "content": user_message},
        ],
        response_format=DocumentMetadata,
    )
    return response.choices[0].message.parsed
