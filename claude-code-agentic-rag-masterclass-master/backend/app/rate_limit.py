import base64
import json

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _get_user_key(request: Request) -> str:
    """Extract user ID from JWT payload for per-user rate limiting.

    Decodes the JWT payload locally (no network call) to read the `sub` claim.
    Falls back to IP address for unauthenticated requests.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            parts = token.split(".")
            if len(parts) == 3:
                payload_b64 = parts[1]
                # Restore base64 padding
                payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
                payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                user_id = payload.get("sub")
                if user_id:
                    return f"user:{user_id}"
        except Exception:
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=_get_user_key)
