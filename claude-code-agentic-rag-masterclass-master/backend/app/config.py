from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # LLM provider (Chat Completions — OpenAI-compatible)
    LLM_API_KEY: str
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_MODEL: str = "gpt-4o-mini"

    # Embedding provider (falls back to LLM settings if not set)
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_API_KEY: Optional[str] = None
    EMBEDDING_BASE_URL: Optional[str] = None

    LANGSMITH_API_KEY: str = ""
    LANGSMITH_PROJECT: str = "rag-masterclass"
    LANGSMITH_TRACING: bool = True

    # Memory settings
    MEMORY_EXTRACTION_ENABLED: bool = True
    MAX_HISTORY_TOKENS: int = 6000
    RECENT_MESSAGES_KEEP: int = 6

    # Web search (Tavily)
    TAVILY_API_KEY: Optional[str] = None
    TAVILY_MAX_RESULTS: int = 5

    # Text-to-SQL
    SQL_QUERY_ENABLED: bool = True
    SQL_MAX_ROWS: int = 50

    LLM_TIMEOUT: int = 120

    CORS_ORIGINS: str = "http://localhost:5173"

    model_config = {"env_file": ".env"}

    @property
    def effective_embedding_api_key(self) -> str:
        return self.EMBEDDING_API_KEY or self.LLM_API_KEY

    @property
    def effective_embedding_base_url(self) -> str:
        return self.EMBEDDING_BASE_URL or self.LLM_BASE_URL

settings = Settings()
