from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime

class ConversationCreate(BaseModel):
    title: str = "New Conversation"

class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=32000)

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    user_id: str
    role: str
    content: str
    created_at: datetime


# ── Memory models ────────────────────────────────────────────────────

class MemoryExtraction(BaseModel):
    memories: list[str]


class ConversationSummary(BaseModel):
    summary: str


