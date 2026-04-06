-- Fix auto-link trigger to handle campaigns with no product filter
CREATE OR REPLACE FUNCTION public.auto_link_opportunity_to_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_rec RECORD;
  opp_product_ids uuid[];
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Collect product IDs from the opportunity
  opp_product_ids := ARRAY[]::uuid[];
  IF NEW.dataset_id IS NOT NULL THEN
    opp_product_ids := opp_product_ids || NEW.dataset_id;
  END IF;

  SELECT array_agg(op.dataset_id) INTO opp_product_ids
  FROM (
    SELECT UNNEST(opp_product_ids) AS dataset_id
    UNION
    SELECT dataset_id FROM public.opportunity_products WHERE opportunity_id = NEW.id
  ) op
  WHERE op.dataset_id IS NOT NULL;

  FOR target_rec IN
    SELECT ct.id, ct.campaign_id, c.target_product_ids
    FROM public.campaign_targets ct
    JOIN public.campaigns c ON c.id = ct.campaign_id
    WHERE ct.client_id = NEW.client_id
      AND ct.opportunity_id IS NULL
      AND ct.status NOT IN ('won', 'lost')
      AND c.status = 'active'
      AND (c.started_at IS NULL OR c.started_at <= NEW.created_at)
  LOOP
    -- Match if: either side has no products, or products overlap
    IF (opp_product_ids IS NULL OR array_length(opp_product_ids, 1) IS NULL)
       OR (target_rec.target_product_ids IS NULL OR array_length(target_rec.target_product_ids, 1) IS NULL OR array_length(target_rec.target_product_ids, 1) = 0)
       OR (target_rec.target_product_ids && opp_product_ids) THEN

      UPDATE public.campaign_targets
      SET
        opportunity_id = NEW.id,
        status = CASE WHEN status IN ('not_started', 'outreach_ready', 'contacted', 'engaged', 'meeting_booked')
                      THEN 'opportunity_opened' ELSE status END,
        updated_at = now()
      WHERE id = target_rec.id;

      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
