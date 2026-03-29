import hashlib
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, BackgroundTasks
from app.dependencies import get_current_user, get_supabase_client
from app.rate_limit import limiter
from app.services.import_service import process_document

router = APIRouter()

ALLOWED_TYPES = {"txt", "md", "pdf", "jpg", "jpeg", "png", "gif", "webp", "tiff", "bmp"}

_IMAGE_TYPES = {"jpg", "jpeg", "png", "gif", "webp", "tiff", "bmp"}
MAX_FILE_SIZE_TEXT   = 10 * 1024 * 1024   # 10 MB
MAX_FILE_SIZE_IMAGES = 10 * 1024 * 1024   # 10 MB
MAX_FILE_SIZE_PDF    = 50 * 1024 * 1024   # 50 MB


def _compute_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@router.get("/documents")
async def list_documents(user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    result = supabase.table("documents").select("*") \
        .eq("user_id", user["id"]).order("created_at", desc=True).execute()
    return result.data


@router.post("/documents")
@limiter.limit("5/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Allowed: {sorted(ALLOWED_TYPES)}",
        )

    content = await file.read()

    if ext == "pdf":
        max_size = MAX_FILE_SIZE_PDF
    elif ext in _IMAGE_TYPES:
        max_size = MAX_FILE_SIZE_IMAGES
    else:
        max_size = MAX_FILE_SIZE_TEXT

    if len(content) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {max_size // (1024 * 1024)} MB for .{ext} files.",
        )

    content_hash = _compute_hash(content)
    user_id = user["id"]
    supabase = get_supabase_client()

    # 1. Check for exact hash match (same content)
    hash_match = (
        supabase.table("documents")
        .select("id, status, filename")
        .eq("user_id", user_id)
        .eq("content_hash", content_hash)
        .execute()
    )

    if hash_match.data:
        existing = hash_match.data[0]

        # Case A: Identical content already successfully processed → reject
        if existing["status"] == "complete":
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Duplicate: this file's content already exists as "
                    f'"{existing["filename"]}" (id: {existing["id"]}).'
                ),
            )

        # Case B: Same content previously errored → retry by resetting status
        if existing["status"] == "error":
            supabase.table("documents").update({
                "status": "pending",
                "error_msg": None,
                "filename": file.filename,
                "file_size": len(content),
            }).eq("id", existing["id"]).execute()

            document = (
                supabase.table("documents")
                .select("*")
                .eq("id", existing["id"])
                .single()
                .execute()
            ).data

            background_tasks.add_task(
                process_document,
                document_id=document["id"],
                user_id=user_id,
                file_content=content,
                file_type=ext,
                filename=file.filename,
                supabase=supabase,
            )
            return document

        # Case C: Still pending/processing with same hash → inform user
        raise HTTPException(
            status_code=409,
            detail=(
                f"File is already being processed "
                f'(id: {existing["id"]}, status: {existing["status"]}).'
            ),
        )

    # 2. Same filename, different content → delete old doc (chunks cascade)
    name_match = (
        supabase.table("documents")
        .select("id")
        .eq("user_id", user_id)
        .eq("filename", file.filename)
        .execute()
    )

    if name_match.data:
        old_id = name_match.data[0]["id"]
        supabase.table("documents").delete().eq("id", old_id).execute()

    # 3. Insert new document row
    result = supabase.table("documents").insert({
        "user_id": user_id,
        "filename": file.filename,
        "file_type": ext,
        "file_size": len(content),
        "status": "pending",
        "content_hash": content_hash,
    }).execute()
    document = result.data[0]

    background_tasks.add_task(
        process_document,
        document_id=document["id"],
        user_id=user_id,
        file_content=content,
        file_type=ext,
        filename=file.filename,
        supabase=supabase,
    )

    return document


@router.post("/documents/{document_id}/metadata")
async def reextract_metadata(document_id: str, user: dict = Depends(get_current_user)):
    from app.services.metadata_service import extract_metadata
    supabase = get_supabase_client()

    doc = supabase.table("documents").select("*").eq("id", document_id).eq("user_id", user["id"]).single().execute()
    if not doc.data:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.data["status"] != "complete":
        raise HTTPException(status_code=400, detail="Can only re-extract metadata from complete documents")

    chunks_result = supabase.table("chunks").select("content, chunk_index") \
        .eq("document_id", document_id).order("chunk_index").execute()
    text = " ".join(c["content"] for c in (chunks_result.data or []))

    try:
        metadata = extract_metadata(text, doc.data["filename"])
        metadata_dict = metadata.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Metadata extraction failed: {str(e)}")

    supabase.table("documents").update({"metadata": metadata_dict}).eq("id", document_id).execute()
    updated = supabase.table("documents").select("*").eq("id", document_id).single().execute()
    return updated.data


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    supabase.table("documents").delete() \
        .eq("id", document_id).eq("user_id", user["id"]).execute()
    return {"message": "Deleted"}
