from app.services.langsmith_service import get_traced_openai_client

_client = None


def get_openai_client():
    global _client
    if _client is None:
        _client = get_traced_openai_client()
    return _client


def create_response_stream(user_message: str, previous_response_id: str | None = None):
    client = get_openai_client()
    kwargs = {
        "model": "gpt-4o-mini",
        "input": user_message,
        "stream": True,
    }
    if previous_response_id:
        kwargs["previous_response_id"] = previous_response_id

    return client.responses.create(**kwargs)
