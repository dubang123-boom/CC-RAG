import os
from openai import OpenAI
from app.config import settings


def get_traced_openai_client() -> OpenAI:
    """Return an OpenAI client wrapped with LangSmith tracing if configured."""
    os.environ.setdefault("LANGSMITH_TRACING", str(settings.LANGSMITH_TRACING).lower())
    if settings.LANGSMITH_API_KEY:
        os.environ.setdefault("LANGSMITH_API_KEY", settings.LANGSMITH_API_KEY)
    if settings.LANGSMITH_PROJECT:
        os.environ.setdefault("LANGSMITH_PROJECT", settings.LANGSMITH_PROJECT)

    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    if settings.LANGSMITH_API_KEY:
        try:
            from langsmith.wrappers import wrap_openai
            client = wrap_openai(client)
        except ImportError:
            pass

    return client
