
CREATE OR REPLACE FUNCTION public.auto_create_next_renewal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'Renewed' AND OLD.status IS DISTINCT FROM 'Renewed' THEN
    -- Create next renewal due in 365 days
    INSERT INTO public.renewals (client_id, dataset_id, contract_id, value, probability, renewal_date, status, created_by)
    VALUES (
      NEW.client_id,
      NEW.dataset_id,
      NEW.contract_id,
      NEW.value,
      50,
      (NEW.renewal_date::date + INTERVAL '365 days')::date,
      'Upcoming',
      NEW.created_by
    );

    -- Ensure client is marked as Active Client
    UPDATE public.clients
    SET relationship_status = 'Active Client'
    WHERE id = NEW.client_id
      AND relationship_status != 'Active Client';
  END IF;
  RETURN NEW;
END;
$$;
