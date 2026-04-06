-- Add actual_value column for Closed Won deals
-- When a deal closes, the user enters the real contract value which may differ from the estimate
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS actual_value numeric(15,2);
