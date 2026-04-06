
-- 1. Create action_dismissals table for persistent snooze/dismiss
CREATE TABLE public.action_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action_key text NOT NULL,
  dismissed_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_key)
);

ALTER TABLE public.action_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dismissals"
  ON public.action_dismissals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dismissals"
  ON public.action_dismissals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dismissals"
  ON public.action_dismissals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dismissals"
  ON public.action_dismissals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 2. Add last_activity_at to opportunities
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

-- 3. Backfill last_activity_at from activities table
UPDATE public.opportunities o
SET last_activity_at = sub.latest
FROM (
  SELECT opportunity_id, MAX(created_at) AS latest
  FROM public.activities
  WHERE opportunity_id IS NOT NULL
  GROUP BY opportunity_id
) sub
WHERE o.id = sub.opportunity_id;

-- 4. Create trigger function to auto-update last_activity_at
CREATE OR REPLACE FUNCTION public.update_opportunity_last_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    UPDATE public.opportunities
    SET last_activity_at = NEW.created_at
    WHERE id = NEW.opportunity_id
      AND (last_activity_at IS NULL OR last_activity_at < NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Attach trigger to activities table
CREATE TRIGGER trg_update_opportunity_last_activity
  AFTER INSERT ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_opportunity_last_activity();
