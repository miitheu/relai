import { createClient } from '@supabase/supabase-js';

// Read-only client for the Insight Hub database
// Uses the publishable anon key — safe for client-side use
const INSIGHT_HUB_URL = 'https://boxjclakavfruhrwfivl.supabase.co';
const INSIGHT_HUB_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJveGpjbGFrYXZmcnVocndmaXZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAwNjc5MjUsImV4cCI6MjA3NTY0MzkyNX0.rwXP8wrjqqABmjg9cek27gB9_jpQ5l_7ZXiiNrN3TM0';

export const insightHub = createClient(INSIGHT_HUB_URL, INSIGHT_HUB_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
