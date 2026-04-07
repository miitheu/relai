-- ===========================================
-- Relai CRM — Self-Hosted Auth Tables
-- ===========================================
-- These tables are used in self-hosted mode to replace Supabase Auth.
-- In hosted mode (Supabase), auth.users handles this instead.

CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_confirmed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_user_meta_data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON public.app_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_refresh_token ON public.app_sessions (refresh_token);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON public.app_sessions (expires_at);

-- Auto-cleanup expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE sql
AS $$ DELETE FROM public.app_sessions WHERE expires_at < now() $$;
