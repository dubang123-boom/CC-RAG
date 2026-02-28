import re
from pydantic import BaseModel, Field
from app.services.llm_service import get_llm_client
from app.config import settings


class GeneratedSQL(BaseModel):
    sql: str = Field(
        description="A SELECT query against the documents table. Use {{USER_ID}} as placeholder for the user's ID.",
    )
    reasoning: str = Field(
        description="Brief explanation of what this query does (1 sentence).",
    )


_SQL_SYSTEM_PROMPT = """You are a SQL query generator for a document management system.

Table schema:
  documents (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT,           -- e.g. 'pdf', 'txt', 'md', 'jpg', 'png'
    file_size BIGINT,         -- bytes
    status TEXT,              -- 'pending', 'processing', 'complete', 'error'
    chunk_count INT DEFAULT 0,
    content_hash TEXT,
    metadata JSONB,           -- keys: language (e.g. 'en','zh'), document_type ('article','manual','report','other'), summary
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
  )

Rules:
- ONLY generate SELECT statements
- MUST include WHERE user_id = '{{USER_ID}}' to scope to the current user
- ONLY query the documents table
- For metadata fields, use metadata->>'key' syntax (e.g. metadata->>'language')
- Do NOT use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, or TRUNCATE
- Keep queries simple and focused

Example queries:
- Count all documents: SELECT COUNT(*) as total FROM documents WHERE user_id = '{{USER_ID}}' AND status = 'complete'
- List PDFs: SELECT filename, file_size, created_at FROM documents WHERE user_id = '{{USER_ID}}' AND file_type = 'pdf' AND status = 'complete'
- Count by language: SELECT metadata->>'language' as language, COUNT(*) as count FROM documents WHERE user_id = '{{USER_ID}}' AND status = 'complete' GROUP BY metadata->>'language'
"""


def generate_sql(question: str) -> GeneratedSQL | None:
    """
    Use LLM structured output to generate a SQL query from a natural language question.
    Returns None on failure.
    """
    client = get_llm_client()
    try:
        response = client.beta.chat.completions.parse(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": _SQL_SYSTEM_PROMPT},
                {"role": "user", "content": question},
            ],
            response_format=GeneratedSQL,
        )
        return response.choices[0].message.parsed
    except Exception:
        return None


_DANGEROUS_PATTERN = re.compile(
    r'\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b',
    re.IGNORECASE,
)

_FROM_TABLE_PATTERN = re.compile(
    r'\bFROM\s+(\w+)',
    re.IGNORECASE,
)


def _is_safe_query(sql: str) -> bool:
    """Validate that a SQL query is safe to execute."""
    stripped = sql.strip()

    # Must start with SELECT
    if not stripped.upper().startswith("SELECT"):
        return False

    # No dangerous operations
    if _DANGEROUS_PATTERN.search(stripped):
        return False

    # Must contain user_id placeholder
    if "{{USER_ID}}" not in stripped:
        return False

    # FROM clause must reference only documents table
    tables = _FROM_TABLE_PATTERN.findall(stripped)
    if not tables:
        return False
    for table in tables:
        if table.lower() not in ("documents",):
            return False

    return True


def execute_sql(generated: GeneratedSQL, user_id: str, supabase) -> dict:
    """
    Validate and execute a generated SQL query.
    Returns {"success": True, "rows": [...], "count": N} or {"success": False, "error": "..."}.
    """
    if not _is_safe_query(generated.sql):
        return {"success": False, "error": "Query rejected by safety validation."}

    # Replace placeholder with actual user ID
    safe_sql = generated.sql.replace("{{USER_ID}}", user_id)

    try:
        result = supabase.rpc(
            "execute_user_sql",
            {"sql_query": safe_sql, "max_rows": settings.SQL_MAX_ROWS},
        ).execute()

        rows = result.data if isinstance(result.data, list) else (result.data or [])
        return {"success": True, "rows": rows, "count": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def format_sql_results_for_llm(generated: GeneratedSQL, result: dict) -> str:
    """Format SQL query and results for injection into LLM context."""
    parts = [
        f"[Document Metadata Query]",
        f"Question intent: {generated.reasoning}",
        f"SQL: {generated.sql}",
    ]

    if not result["success"]:
        parts.append(f"Error: {result['error']}")
        return "\n".join(parts)

    rows = result["rows"]
    if not rows:
        parts.append("Result: No matching documents found.")
        return "\n".join(parts)

    # Build markdown table
    headers = list(rows[0].keys())
    parts.append("")
    parts.append("| " + " | ".join(headers) + " |")
    parts.append("| " + " | ".join("---" for _ in headers) + " |")

    display_rows = rows[:20]
    for row in display_rows:
        parts.append("| " + " | ".join(str(row.get(h, "")) for h in headers) + " |")

    if len(rows) > 20:
        parts.append(f"\n... and {len(rows) - 20} more rows (truncated)")

    parts.append(f"\nTotal: {result['count']} row(s)")
    return "\n".join(parts)
