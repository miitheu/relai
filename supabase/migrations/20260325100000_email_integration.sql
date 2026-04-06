-- Email Integration: extend emails table for Gmail sync + privacy controls

-- New columns on emails table
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_message_id TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS sync_source TEXT DEFAULT 'manual';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS from_address TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS to_addresses TEXT[];
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS body_text TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS body_html TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public';
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE public.emails ADD COLUMN IF NOT EXISTS ai_next_action TEXT;

-- Indexes for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_gmail_id ON public.emails(gmail_message_id) WHERE gmail_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_contact ON public.emails(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_client ON public.emails(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_thread ON public.emails(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emails_direction ON public.emails(direction);

-- Index contacts.email for matching during sync
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(email) WHERE email IS NOT NULL AND email != '';

-- Add check constraints (use DO block to handle existing data gracefully)
DO $$ BEGIN
  ALTER TABLE public.emails ADD CONSTRAINT emails_sync_source_check
    CHECK (sync_source IN ('manual', 'gmail', 'outlook'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.emails ADD CONSTRAINT emails_direction_check
    CHECK (direction IN ('inbound', 'outbound'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.emails ADD CONSTRAINT emails_visibility_check
    CHECK (visibility IN ('public', 'private', 'summary_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
