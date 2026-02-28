-- Function to execute user-scoped SELECT queries safely
CREATE OR REPLACE FUNCTION execute_user_sql(sql_query TEXT, max_rows INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Only allow SELECT statements
  IF sql_query !~* '^SELECT' THEN
    RAISE EXCEPTION 'Only SELECT statements are allowed';
  END IF;

  -- Block dangerous operations
  IF sql_query ~* '\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b' THEN
    RAISE EXCEPTION 'Dangerous operation detected';
  END IF;

  -- Execute with row limit
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM ('
    || sql_query || ' LIMIT ' || max_rows || ') t'
    INTO result;

  RETURN result;
END;
$$;
