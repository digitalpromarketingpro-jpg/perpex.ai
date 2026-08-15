-- ═══════════════════════════════════════════════════════════════
-- PRODUCTION OPTIMIZATIONS FOR 1M+ CONCURRENT USERS
-- Apply these after running schema.sql
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Additional Performance Indexes ──────────────────────────

-- Composite index for pending orders by status and price (for price watchers)
CREATE INDEX IF NOT EXISTS idx_pending_orders_status_price 
  ON pending_orders(user_id, status, limit_price) 
  WHERE status = 'pending';

-- Index for trade history pagination with filters
CREATE INDEX IF NOT EXISTS idx_trade_history_user_status_time 
  ON trade_history(user_id, status, closed_at DESC);

-- Partial index for active positions by symbol (hot path)
CREATE INDEX IF NOT EXISTS idx_active_positions_user_symbol_active 
  ON active_positions(user_id, symbol, opened_at DESC);

-- ── 2. Database Connection Pooling (pgBouncer config) ─────────
-- Add to Supabase Dashboard → Database Settings → Connection Pooling
-- Mode: Transaction
-- Pool Size: 15 (per CPU core)
-- Max Client Connections: 100

-- ── 3. Query Performance Monitoring ────────────────────────────

-- Enable pg_stat_statements for query analysis
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View for slow queries (run periodically)
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
  query,
  calls,
  total_exec_time,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100 -- queries slower than 100ms
ORDER BY mean_exec_time DESC
LIMIT 50;

-- ── 4. Add Constraints for Data Integrity ─────────────────────

-- Ensure equity can never go negative (bankruptcy protection)
ALTER TABLE profiles 
  ADD CONSTRAINT check_equity_non_negative 
  CHECK (equity >= 0);

-- Ensure available_margin is always <= equity
ALTER TABLE profiles 
  ADD CONSTRAINT check_margin_within_equity 
  CHECK (available_margin <= equity);

-- ── 5. Materialized View for Leaderboard (optional) ───────────

CREATE MATERIALIZED VIEW IF NOT EXISTS user_leaderboard AS
SELECT 
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.equity,
  COALESCE(SUM(th.realized_pnl), 0) as total_pnl,
  COUNT(DISTINCT th.id) as total_trades,
  COUNT(DISTINCT ap.id) as active_positions_count
FROM profiles p
LEFT JOIN trade_history th ON th.user_id = p.id
LEFT JOIN active_positions ap ON ap.user_id = p.id
GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.equity
ORDER BY p.equity DESC
LIMIT 100;

-- Refresh leaderboard every 5 minutes (set up via cron or pg_cron)
CREATE INDEX IF NOT EXISTS idx_leaderboard_equity ON user_leaderboard(equity DESC);

-- ── 6. Rate Limiting via Database (optional alternative to app-level) ──

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window 
  ON rate_limits(user_id, action, window_start DESC);

-- Function to check rate limit (e.g., max 10 orders per minute)
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_requests INT,
  p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  v_window_start := date_trunc('minute', now());
  
  -- Get current count for this window
  SELECT request_count INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id 
    AND action = p_action 
    AND window_start = v_window_start;
  
  IF v_count IS NULL THEN
    -- First request in this window
    INSERT INTO rate_limits (user_id, action, window_start, request_count)
    VALUES (p_user_id, p_action, v_window_start, 1);
    RETURN TRUE;
  ELSIF v_count < p_max_requests THEN
    -- Increment counter
    UPDATE rate_limits 
    SET request_count = request_count + 1
    WHERE user_id = p_user_id 
      AND action = p_action 
      AND window_start = v_window_start;
    RETURN TRUE;
  ELSE
    -- Rate limit exceeded
    RETURN FALSE;
  END IF;
END;
$$;

-- ── 7. Cleanup Old Data (Retention Policy) ────────────────────

-- Delete rate_limits older than 1 hour (run via cron)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM rate_limits 
  WHERE window_start < now() - interval '1 hour';
END;
$$;

-- Archive old trade history (keep last 90 days in main table)
CREATE TABLE IF NOT EXISTS trade_history_archive (
  LIKE trade_history INCLUDING ALL
);

CREATE OR REPLACE FUNCTION archive_old_trades()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Move trades older than 90 days to archive
  WITH moved AS (
    DELETE FROM trade_history
    WHERE closed_at < now() - interval '90 days'
    RETURNING *
  )
  INSERT INTO trade_history_archive
  SELECT * FROM moved;
END;
$$;

-- ── 8. Vacuum and Analyze Automation ──────────────────────────

-- Ensure autovacuum is aggressive enough for high-write tables
ALTER TABLE trade_history SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE active_positions SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- ── 9. Add Audit Trail (optional for compliance) ──────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_time 
  ON audit_log(user_id, created_at DESC);

-- ── 10. Security: Prevent SQL Injection in RPC Functions ──────

-- All RPC functions already use parameterized queries ($$)
-- and SECURITY DEFINER with explicit search_path
-- No additional changes needed - already secure

-- ═══════════════════════════════════════════════════════════════
-- DEPLOYMENT CHECKLIST
-- ═══════════════════════════════════════════════════════════════
-- 
-- 1. Run schema.sql first
-- 2. Run this file (production-optimizations.sql)
-- 3. Configure pgBouncer in Supabase Dashboard
-- 4. Set up pg_cron for:
--    - cleanup_old_rate_limits() every hour
--    - archive_old_trades() daily at 3am
--    - REFRESH MATERIALIZED VIEW user_leaderboard every 5min
-- 5. Monitor slow_queries view weekly
-- 6. Set up alerts for:
--    - Database CPU > 80%
--    - Connection pool saturation
--    - Slow query count spike
-- 
-- ═══════════════════════════════════════════════════════════════
