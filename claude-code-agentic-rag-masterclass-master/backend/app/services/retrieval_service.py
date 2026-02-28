from dataclasses import dataclass
from supabase import Client
from app.services.embedding_service import embed_texts


@dataclass
class RetrievalResult:
    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    similarity: float


def retrieve_chunks(
    query: str,
    user_id: str,
    supabase: Client,
    match_count: int = 5,
    match_threshold: float = 0.1,
    filters: dict | None = None,
) -> list[RetrievalResult]:
    """
    Embed the query, run vector similarity search via match_chunks RPC.
    When filters are provided (language, document_type), calls match_chunks_filtered
    which JOINs documents table to apply metadata WHERE clauses.
    Returns results ordered by similarity (highest first).
    Returns empty list if no matches above threshold.
    """
    embedding = embed_texts([query])[0]
    active_filters = {k: v for k, v in (filters or {}).items() if v is not None}

    if active_filters:
        result = supabase.rpc("match_chunks_filtered", {
            "query_embedding": embedding,
            "match_user_id": user_id,
            "match_count": match_count,
            "match_threshold": match_threshold,
            "filter_language": active_filters.get("language"),
            "filter_document_type": active_filters.get("document_type"),
        }).execute()
    else:
        result = supabase.rpc("match_chunks", {
            "query_embedding": embedding,
            "match_user_id": user_id,
            "match_count": match_count,
            "match_threshold": match_threshold,
        }).execute()

    return [
        RetrievalResult(
            chunk_id=row["id"],
            document_id=row["document_id"],
            content=row["content"],
            chunk_index=row["chunk_index"],
            similarity=row["similarity"],
        )
        for row in (result.data or [])
    ]
