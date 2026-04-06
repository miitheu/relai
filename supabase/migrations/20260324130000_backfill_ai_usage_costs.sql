-- Backfill cost_usd for existing ai_usage_log rows based on model and token counts
-- Rates are per 1M tokens (input/output)
UPDATE public.ai_usage_log
SET cost_usd = CASE
  WHEN model IN ('claude-sonnet-4-20250514', 'claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-3-5-sonnet-20241022')
    THEN (prompt_tokens / 1000000.0) * 3.0 + (completion_tokens / 1000000.0) * 15.0
  WHEN model IN ('claude-opus-4-20250514', 'claude-opus-4-6', 'claude-opus-4-5-20251101', 'claude-opus-4-1-20250805')
    THEN (prompt_tokens / 1000000.0) * 15.0 + (completion_tokens / 1000000.0) * 75.0
  WHEN model IN ('claude-haiku-4-5-20251001', 'claude-3-5-haiku-20241022')
    THEN (prompt_tokens / 1000000.0) * 1.0 + (completion_tokens / 1000000.0) * 5.0
  ELSE
    (prompt_tokens / 1000000.0) * 3.0 + (completion_tokens / 1000000.0) * 15.0
END
WHERE cost_usd = 0 AND total_tokens > 0;
