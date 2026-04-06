
CREATE OR REPLACE FUNCTION public.update_client_status_on_closed_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When an opportunity moves to 'Closed Won', update the client to 'Active Client'
  IF NEW.stage = 'Closed Won' AND (OLD.stage IS DISTINCT FROM 'Closed Won') THEN
    UPDATE public.clients
    SET relationship_status = 'Active Client'
    WHERE id = NEW.client_id
      AND relationship_status != 'Active Client';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_client_on_closed_won
  AFTER UPDATE OF stage ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_client_status_on_closed_won();

-- Also fix existing data: mark clients with Closed Won opps as Active Client
UPDATE public.clients
SET relationship_status = 'Active Client'
WHERE id IN (
  SELECT DISTINCT client_id FROM public.opportunities WHERE stage = 'Closed Won'
)
AND relationship_status != 'Active Client';
