
-- Client provenance table: tracks every source that contributed to an account
CREATE TABLE public.client_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'manual',
  source_identifier text,
  source_name text,
  source_metadata jsonb DEFAULT '{}'::jsonb,
  imported_by uuid,
  imported_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by client
CREATE INDEX idx_client_provenance_client_id ON public.client_provenance(client_id);
CREATE INDEX idx_client_provenance_source_type ON public.client_provenance(source_type);

-- Enable RLS
ALTER TABLE public.client_provenance ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated can view provenance"
  ON public.client_provenance FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert provenance"
  ON public.client_provenance FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can delete provenance"
  ON public.client_provenance FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update provenance"
  ON public.client_provenance FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
