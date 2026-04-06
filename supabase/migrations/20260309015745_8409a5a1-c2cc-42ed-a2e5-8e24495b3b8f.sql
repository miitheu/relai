
-- Add ball status and next action fields to opportunities
ALTER TABLE public.opportunities 
  ADD COLUMN IF NOT EXISTS ball_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS next_action_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS next_action_due_date date;
