from app.services.llm_service import get_embedding_client
from app.config import settings

BATCH_SIZE = 512


def embed_texts(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of strings using the configured embedding model.
    Handles batching automatically. Returns vectors in the same order as input.
    """
    client = get_embedding_client()
    all_embeddings: list[list[float]] = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=batch,
        )
        sorted_data = sorted(response.data, key=lambda x: x.index)
        all_embeddings.extend([item.embedding for item in sorted_data])

    return all_embeddings
