-- Auto-update campaign target status when emails are logged/synced
-- and auto-link opportunities to campaign targets

-- 1. When an email is inserted for a client, auto-mark matching campaign targets as 'contacted'
CREATE OR REPLACE FUNCTION public.auto_update_campaign_target_on_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process if the email has a client_id
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find campaign targets for this client that are still in early stages
  UPDATE public.campaign_targets ct
  SET
    status = 'contacted',
    contacted_at = COALESCE(ct.contacted_at, NEW.email_date),
    updated_at = now()
  FROM public.campaigns c
  WHERE ct.campaign_id = c.id
    AND ct.client_id = NEW.client_id
    AND ct.status IN ('not_started', 'outreach_ready')
    AND c.status = 'active';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_auto_campaign_status ON public.emails;
CREATE TRIGGER trg_email_auto_campaign_status
  AFTER INSERT ON public.emails
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_campaign_target_on_email();

-- 2. When an opportunity is created, auto-link to matching campaign targets
-- Match by: client_id, campaign started before opportunity, overlapping products
CREATE OR REPLACE FUNCTION public.auto_link_opportunity_to_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_rec RECORD;
  opp_product_ids uuid[];
BEGIN
  -- Only process if the opportunity has a client_id
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Collect product IDs from the opportunity (dataset_id + opportunity_products)
  opp_product_ids := ARRAY[]::uuid[];
  IF NEW.dataset_id IS NOT NULL THEN
    opp_product_ids := opp_product_ids || NEW.dataset_id;
  END IF;

  -- Also check opportunity_products table
  SELECT array_agg(op.dataset_id) INTO opp_product_ids
  FROM (
    SELECT UNNEST(opp_product_ids) AS dataset_id
    UNION
    SELECT dataset_id FROM public.opportunity_products WHERE opportunity_id = NEW.id
  ) op
  WHERE op.dataset_id IS NOT NULL;

  -- Find matching campaign targets:
  -- - same client
  -- - campaign is active and started before this opportunity
  -- - campaign products overlap with opportunity products
  -- - target doesn't already have an opportunity linked
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
    -- Check product overlap (if opp has no products, match any campaign)
    IF opp_product_ids IS NULL OR array_length(opp_product_ids, 1) IS NULL
       OR target_rec.target_product_ids && opp_product_ids THEN
      -- Link the opportunity and update status
      UPDATE public.campaign_targets
      SET
        opportunity_id = NEW.id,
        status = CASE WHEN status IN ('not_started', 'outreach_ready', 'contacted', 'engaged', 'meeting_booked')
                      THEN 'opportunity_opened' ELSE status END,
        updated_at = now()
      WHERE id = target_rec.id;

      -- Only link to the first matching campaign target
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opportunity_auto_campaign_link ON public.opportunities;
CREATE TRIGGER trg_opportunity_auto_campaign_link
  AFTER INSERT ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_opportunity_to_campaign();
