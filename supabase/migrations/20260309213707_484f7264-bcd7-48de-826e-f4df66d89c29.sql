
-- Add actual_close_date column
ALTER TABLE public.opportunities ADD COLUMN actual_close_date date;

-- Create trigger to auto-set actual_close_date when stage moves to Closed Won or Closed Lost
CREATE OR REPLACE FUNCTION public.set_actual_close_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stage IN ('Closed Won', 'Closed Lost') AND OLD.stage NOT IN ('Closed Won', 'Closed Lost') THEN
    NEW.actual_close_date := CURRENT_DATE;
  ELSIF NEW.stage NOT IN ('Closed Won', 'Closed Lost') AND OLD.stage IN ('Closed Won', 'Closed Lost') THEN
    NEW.actual_close_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_actual_close_date
BEFORE UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.set_actual_close_date();
