from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ConversationCreate(BaseModel):
    title: str = "New Conversation"

class ConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    openai_response_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class MessageCreate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    user_id: str
    role: str
    content: str
    created_at: datetime
