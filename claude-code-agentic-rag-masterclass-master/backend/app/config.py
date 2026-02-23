from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    OPENAI_API_KEY: str
    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "rag-masterclass"
    LANGSMITH_TRACING: bool = True
    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env"}

settings = Settings()
