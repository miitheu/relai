
CREATE OR REPLACE FUNCTION public.set_actual_close_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stage = 'Closed Won' AND OLD.stage IS DISTINCT FROM 'Closed Won' THEN
    NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    NEW.ball_status := 'closed_won';
  ELSIF NEW.stage = 'Closed Lost' AND OLD.stage IS DISTINCT FROM 'Closed Lost' THEN
    NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    NEW.ball_status := 'closed_lost';
  ELSIF NEW.stage NOT IN ('Closed Won', 'Closed Lost') AND OLD.stage IN ('Closed Won', 'Closed Lost') THEN
    NEW.actual_close_date := NULL;
    IF NEW.ball_status IN ('closed_won', 'closed_lost') THEN
      NEW.ball_status := 'unknown';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
