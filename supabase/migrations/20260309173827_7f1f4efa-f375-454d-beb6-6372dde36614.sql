
CREATE POLICY "Owners and creators can delete opportunities"
ON public.opportunities
FOR DELETE
TO authenticated
USING (auth.uid() = owner_id OR auth.uid() = created_by);
