-- Allow users to manage their own integration configs (not just admins)
-- This enables non-admin users to connect Gmail from Settings

CREATE POLICY "Users can view own integration configs"
  ON public.integration_configs FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can insert own integration configs"
  ON public.integration_configs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own integration configs"
  ON public.integration_configs FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete own integration configs"
  ON public.integration_configs FOR DELETE TO authenticated
  USING (created_by = auth.uid());
