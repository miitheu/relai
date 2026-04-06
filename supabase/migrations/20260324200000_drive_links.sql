-- Google Drive link associations for clients and opportunities
CREATE TABLE public.drive_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  link_type TEXT NOT NULL DEFAULT 'file' CHECK (link_type IN ('folder', 'file')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drive_links_client ON public.drive_links(client_id);
CREATE INDEX idx_drive_links_opp ON public.drive_links(opportunity_id);

ALTER TABLE public.drive_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view drive links" ON public.drive_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert drive links" ON public.drive_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Creator can delete drive links" ON public.drive_links FOR DELETE TO authenticated USING (auth.uid() = created_by);
