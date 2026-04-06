
-- Add stage_entered_at to track when opportunity entered current stage
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS stage_entered_at timestamp with time zone DEFAULT now();

-- Backfill: use the latest stage history entry or fall back to created_at
UPDATE public.opportunities o
SET stage_entered_at = COALESCE(
  (SELECT h.created_at FROM public.opportunity_stage_history h WHERE h.opportunity_id = o.id ORDER BY h.created_at DESC LIMIT 1),
  o.created_at
);

-- Trigger to auto-update stage_entered_at when stage changes
CREATE OR REPLACE FUNCTION public.update_stage_entered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stage_entered_at ON public.opportunities;
CREATE TRIGGER trg_update_stage_entered_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_stage_entered_at();
