-- ============================================================
-- Tighten RLS policies: replace overly permissive WITH CHECK (true)
-- with proper owner/creator scoping on tables that have owner_id
-- ============================================================

-- ─── OPPORTUNITIES ───────────────────────────────────────────
-- Owners and creators can insert (the insert must set owner_id to themselves)
DROP POLICY IF EXISTS "Authenticated can insert opportunities" ON public.opportunities;
CREATE POLICY "Owner can insert opportunities" ON public.opportunities
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id OR auth.uid() = created_by);

-- Owners, creators, and admins can update
DROP POLICY IF EXISTS "Authenticated can update opportunities" ON public.opportunities;
CREATE POLICY "Owner or admin can update opportunities" ON public.opportunities
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

-- ─── CAMPAIGNS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can insert campaigns" ON public.campaigns;
CREATE POLICY "Creator can insert campaigns" ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR auth.uid() = owner_id);

DROP POLICY IF EXISTS "Authenticated can update campaigns" ON public.campaigns;
CREATE POLICY "Owner or admin can update campaigns" ON public.campaigns
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() = created_by OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

-- ─── DELIVERIES ──────────────────────────────────────────────
-- deliveries has created_by but no owner_id
DROP POLICY IF EXISTS "Authenticated can insert deliveries" ON public.deliveries;
CREATE POLICY "Creator can insert deliveries" ON public.deliveries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "Authenticated can update deliveries" ON public.deliveries;
CREATE POLICY "Creator or admin can update deliveries" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR created_by IS NULL OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

-- ─── CAMPAIGN TARGETS ────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can insert campaign targets" ON public.campaign_targets;
CREATE POLICY "Owner can insert campaign targets" ON public.campaign_targets
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id OR owner_id IS NULL);

DROP POLICY IF EXISTS "Authenticated can update campaign targets" ON public.campaign_targets;
CREATE POLICY "Owner or admin can update campaign targets" ON public.campaign_targets
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR owner_id IS NULL OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'sales_manager'));

-- ─── TASKS ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can insert tasks" ON public.tasks;
CREATE POLICY "User can insert own tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated can update tasks" ON public.tasks;
CREATE POLICY "User can update own tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ─── NOTIFICATIONS ───────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can update notifications" ON public.notifications;
CREATE POLICY "User can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ─── ACTION DISMISSALS ──────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can insert action dismissals" ON public.action_dismissals;
CREATE POLICY "User can insert own dismissals" ON public.action_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated can update action dismissals" ON public.action_dismissals;
CREATE POLICY "User can update own dismissals" ON public.action_dismissals
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ─── ADMIN AUDIT LOG ────────────────────────────────────────
-- Only admins can insert audit entries
DROP POLICY IF EXISTS "Authenticated can insert audit log" ON public.admin_audit_log;
CREATE POLICY "Admin can insert audit log" ON public.admin_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─── Note: Tables that correctly remain open for all authenticated users ───
-- clients (SELECT/INSERT/UPDATE open - any team member can create/edit accounts)
-- contacts (SELECT/INSERT/UPDATE open - any team member can manage contacts)
-- datasets (SELECT/INSERT/UPDATE open - shared product catalog)
-- notes (INSERT scoped to created_by - already correct)
-- activities (INSERT scoped to created_by - already correct)
-- meetings (open - shared meeting records)
-- emails (open - shared email records)
-- research_signals (open - shared intelligence)
-- contracts (open - shared contract tracking)
-- renewals (open - shared renewal pipeline)
-- All intelligence/fund tables (open - system-managed data)
-- Import staging/batch tables (scoped to batch creator - already correct)

-- ─── COMPOSITE INDEXES for performance ──────────────────────
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_stage ON public.opportunities(owner_id, stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_client_stage ON public.opportunities(client_id, stage);
CREATE INDEX IF NOT EXISTS idx_deliveries_client_type ON public.deliveries(client_id, delivery_type);
CREATE INDEX IF NOT EXISTS idx_renewals_status_date ON public.renewals(status, renewal_date);
CREATE INDEX IF NOT EXISTS idx_fund_runs_client_status ON public.fund_intelligence_runs(client_id, run_status);
CREATE INDEX IF NOT EXISTS idx_campaign_targets_campaign_status ON public.campaign_targets(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_activities_client_created ON public.activities(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_client_created ON public.notes(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON public.contacts(client_id);
