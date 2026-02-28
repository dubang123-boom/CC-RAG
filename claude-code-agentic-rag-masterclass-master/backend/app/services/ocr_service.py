import base64
import io
import pypdf
from app.services.llm_service import get_llm_client
from app.config import settings

_IMAGE_MIME: dict[str, str] = {
    "jpg":  "image/jpeg",
    "jpeg": "image/jpeg",
    "png":  "image/png",
    "gif":  "image/gif",
    "webp": "image/webp",
    "tiff": "image/tiff",
    "bmp":  "image/bmp",
}

_IMAGE_PROMPT = (
    "Extract all text from this image. "
    "Return only the extracted text, preserving the original structure and formatting. "
    "Do not add any commentary or explanation."
)


def _extract_pdf_text(content: bytes) -> str:
    """Extract text from a PDF using pypdf (handles text-based PDFs)."""
    reader = pypdf.PdfReader(io.BytesIO(content))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(p for p in pages if p.strip())


def _extract_image_text(content: bytes, file_type: str) -> str:
    """Extract text from an image using the LLM vision capability."""
    mime = _IMAGE_MIME[file_type]
    encoded = base64.b64encode(content).decode("utf-8")
    data_url = f"data:{mime};base64,{encoded}"

    client = get_llm_client()
    response = client.chat.completions.create(
        model=settings.LLM_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": _IMAGE_PROMPT},
                ],
            }
        ],
        max_tokens=4096,
    )
    return response.choices[0].message.content or ""


def extract_with_ocr(content: bytes, file_type: str) -> str:
    """
    Extract text from a PDF or image file.
    PDF: pypdf text extraction (no API call needed).
    Images: LLM vision model (gpt-4o-mini or compatible).
    """
    if file_type == "pdf":
        return _extract_pdf_text(content)
    if file_type in _IMAGE_MIME:
        return _extract_image_text(content, file_type)
    raise ValueError(f"ocr_service does not support file type: {file_type}")
