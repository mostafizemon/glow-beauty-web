-- Store customer browser context captured when the order is placed.
-- Purchase events are fired later by admin confirmation, so we need to
-- persist the original customer IP/User-Agent for Events API matching.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_ip TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_agent TEXT;
