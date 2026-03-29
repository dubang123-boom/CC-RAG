from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.dependencies import get_current_user, get_supabase_client

router = APIRouter()


class LLMSettingsPayload(BaseModel):
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    llm_title_model: str = ""
    llm_system_prompt: str = ""


@router.get("/settings/llm")
async def get_llm_settings(user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    result = supabase.table("user_settings").select("*").eq("user_id", user["id"]).maybe_single().execute()
    data = result.data or {}
    return {
        "llm_api_key": data.get("llm_api_key") or "",
        "llm_base_url": data.get("llm_base_url") or "",
        "llm_model": data.get("llm_model") or "",
        "llm_title_model": data.get("llm_title_model") or "",
        "llm_system_prompt": data.get("llm_system_prompt") or "",
    }


@router.post("/settings/llm")
async def save_llm_settings(body: LLMSettingsPayload, user: dict = Depends(get_current_user)):
    supabase = get_supabase_client()
    supabase.table("user_settings").upsert(
        {
            "user_id": user["id"],
            "llm_api_key": body.llm_api_key or None,
            "llm_base_url": body.llm_base_url or None,
            "llm_model": body.llm_model or None,
            "llm_title_model": body.llm_title_model or None,
            "llm_system_prompt": body.llm_system_prompt or None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute()
    return {"ok": True}
