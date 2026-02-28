from pydantic import BaseModel
from typing import Optional, Any, Literal
from datetime import datetime


class DocumentResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    file_type: str
    file_size: int
    status: Literal['pending', 'processing', 'complete', 'error']
    error_msg: Optional[str] = None
    chunk_count: int
    content_hash: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
