-- Enable HTTP extension for synchronous API calls from Postgres
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- RPC function to call Anthropic Messages API from Postgres
-- This keeps the API key server-side (no CORS issues, no client exposure)
CREATE OR REPLACE FUNCTION call_anthropic(
  p_system text,
  p_user_message text,
  p_model text DEFAULT 'claude-haiku-4-5-20251001',
  p_max_tokens int DEFAULT 4096
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_api_key text := 'REPLACE_WITH_ANTHROPIC_API_KEY';
  v_response extensions.http_response;
  v_body jsonb;
  v_result jsonb;
BEGIN
  v_body := jsonb_build_object(
    'model', p_model,
    'max_tokens', p_max_tokens,
    'system', p_system,
    'messages', jsonb_build_array(
      jsonb_build_object('role', 'user', 'content', p_user_message)
    )
  );

  SELECT * INTO v_response FROM extensions.http((
    'POST',
    'https://api.anthropic.com/v1/messages',
    ARRAY[
      extensions.http_header('x-api-key', v_api_key),
      extensions.http_header('anthropic-version', '2023-06-01'),
      extensions.http_header('content-type', 'application/json')
    ],
    'application/json',
    v_body::text
  )::extensions.http_request);

  IF v_response.status != 200 THEN
    RAISE EXCEPTION 'Anthropic API error (status %): %', v_response.status, v_response.content;
  END IF;

  v_result := v_response.content::jsonb;
  RETURN v_result;
END;
$$;

-- Only authenticated users can call this
REVOKE EXECUTE ON FUNCTION call_anthropic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION call_anthropic TO authenticated;
