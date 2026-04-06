-- Allow users to delete their own emails
CREATE POLICY "Users can delete own emails"
  ON public.emails FOR DELETE TO authenticated
  USING (created_by = auth.uid());
