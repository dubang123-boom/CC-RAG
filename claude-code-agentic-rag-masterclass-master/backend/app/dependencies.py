from fastapi import Depends, HTTPException, Request
from supabase import create_client, Client
from openai import OpenAI
from app.config import settings


def get_supabase_client() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def get_openai_client() -> OpenAI:
    return OpenAI(api_key=settings.OPENAI_API_KEY)


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = auth_header.split(" ", 1)[1]
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    try:
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": user.id, "email": user.email}
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")
