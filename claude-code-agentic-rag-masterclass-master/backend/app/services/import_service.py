from supabase import Client
from app.services.chunking_service import chunk_text
from app.services.embedding_service import embed_texts
from app.services.metadata_service import extract_metadata
from app.services.ocr_service import extract_with_ocr

_OCR_TYPES = {"pdf", "jpg", "jpeg", "png", "gif", "webp", "tiff", "bmp"}


def _extract_text(content: bytes, file_type: str) -> str:
    """
    Extract plain text from file bytes.
    txt/md: UTF-8 decode.
    pdf + images: Mistral OCR API.
    """
    if file_type in ("txt", "md"):
        return content.decode("utf-8", errors="replace")
    if file_type in _OCR_TYPES:
        return extract_with_ocr(content, file_type)
    raise ValueError(f"Unsupported file type: {file_type}")


def process_document(
    document_id: str,
    user_id: str,
    file_content: bytes,
    file_type: str,
    filename: str,
    supabase: Client,
) -> None:
    """
    Full pipeline: extract → chunk → embed → store → extract metadata.
    Runs as a FastAPI BackgroundTask.
    Updates document.status at each stage so Supabase Realtime can broadcast progress.
    """
    def _set_status(status: str, error_msg: str | None = None):
        update: dict = {"status": status}
        if error_msg:
            update["error_msg"] = error_msg
        supabase.table("documents").update(update).eq("id", document_id).execute()

    try:
        _set_status("processing")

        text = _extract_text(file_content, file_type)
        chunks = chunk_text(text)

        texts = [c.content for c in chunks]
        embeddings = embed_texts(texts)

        rows = [
            {
                "document_id": document_id,
                "user_id": user_id,
                "content": chunk.content,
                "chunk_index": chunk.chunk_index,
                "token_count": chunk.token_count,
                "embedding": embedding,
            }
            for chunk, embedding in zip(chunks, embeddings)
        ]

        BATCH = 100
        for i in range(0, len(rows), BATCH):
            supabase.table("chunks").insert(rows[i:i + BATCH]).execute()

        # Module 4: extract structured metadata via LLM structured output
        try:
            metadata = extract_metadata(text, filename)
            metadata_dict = metadata.model_dump()
        except Exception:
            metadata_dict = None  # extraction failed; still mark complete

        supabase.table("documents").update({
            "status": "complete",
            "chunk_count": len(chunks),
            "metadata": metadata_dict,
        }).eq("id", document_id).execute()

    except Exception as e:
        _set_status("error", error_msg=str(e))
        raise
