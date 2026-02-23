from fastapi import APIRouter, Depends, HTTPException
from supabase import create_client
from app.config import settings
from app.models.auth import SignUpRequest, SignInRequest, UserResponse
from app.dependencies import get_current_user

router = APIRouter()


def _get_auth_client():
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


@router.post("/signup")
async def signup(body: SignUpRequest):
    supabase = _get_auth_client()
    try:
        res = supabase.auth.sign_up({"email": body.email, "password": body.password})
        if res.user is None:
            raise HTTPException(status_code=400, detail="Signup failed")
        return {
            "user": {"id": str(res.user.id), "email": res.user.email},
            "session": {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
            } if res.session else None,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(body: SignInRequest):
    supabase = _get_auth_client()
    try:
        res = supabase.auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
        return {
            "user": {"id": str(res.user.id), "email": res.user.email},
            "session": {
                "access_token": res.session.access_token,
                "refresh_token": res.session.refresh_token,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout():
    return {"message": "Logged out"}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return UserResponse(id=user["id"], email=user["email"])
