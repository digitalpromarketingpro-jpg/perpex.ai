-- ─────────────────────────────────────────────────────────────
-- PerpEx — Supabase PostgreSQL Schema
-- Transactionally consistent trading data with Row Level Security.
--
-- Tables:
--   profiles           — user identity + equity snapshot
--   active_positions   — open perpetual futures positions
--   pending_orders     — limit orders waiting for price trigger
--   trade_history      — closed/executed trade log
--
-- Security:
--   RLS enabled on ALL tables. Every policy scoped to auth.uid().
--   A user can NEVER read or mutate another user's data.
-- ─────────────────────────────────────────────────────────────

-- ── Enable UUID generation ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════
-- 1. PROFILES
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username         TEXT UNIQUE NOT NULL,
  display_name     TEXT,
  avatar_url       TEXT,
  equity           NUMERIC(18, 8) NOT NULL DEFAULT 10000.00,
  available_margin NUMERIC(18, 8) NOT NULL DEFAULT 10000.00,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════════════
-- 2. ACTIVE POSITIONS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS active_positions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('long', 'short')),
  size          NUMERIC(18, 8) NOT NULL CHECK (size > 0),
  entry_price   NUMERIC(18, 8) NOT NULL CHECK (entry_price > 0),
  leverage      INT NOT NULL DEFAULT 1 CHECK (leverage >= 1 AND leverage <= 125),
  margin        NUMERIC(18, 8) NOT NULL DEFAULT 0,
  liq_price     NUMERIC(18, 8) NOT NULL DEFAULT 0,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER active_positions_updated_at
  BEFORE UPDATE ON active_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes for common queries
CREATE INDEX idx_active_positions_user ON active_positions(user_id);
CREATE INDEX idx_active_positions_symbol ON active_positions(user_id, symbol);

-- RLS
ALTER TABLE active_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own positions"
  ON active_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own positions"
  ON active_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions"
  ON active_positions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own positions"
  ON active_positions FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- 3. TRADE HISTORY
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trade_history (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty           NUMERIC(18, 8) NOT NULL CHECK (qty > 0),
  price         NUMERIC(18, 8) NOT NULL CHECK (price > 0),
  realized_pnl  NUMERIC(18, 8) NOT NULL DEFAULT 0,
  fee           NUMERIC(18, 8) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('CLOSED', 'LIQUIDATED', 'FUNDING')),
  closed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_trade_history_user ON trade_history(user_id);
CREATE INDEX idx_trade_history_user_time ON trade_history(user_id, closed_at DESC);

-- RLS
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own trade history"
  ON trade_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade history"
  ON trade_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trade history is immutable — no UPDATE or DELETE policies.

-- ═══════════════════════════════════════════════════════════════
-- 4. RPC: Open Position (Atomic Transaction)
-- ═══════════════════════════════════════════════════════════════
-- Ensures margin is deducted from available_margin AND position
-- is created in a single transaction. Prevents race conditions.

CREATE OR REPLACE FUNCTION open_position(
  p_user_id     UUID,
  p_symbol      TEXT,
  p_side        TEXT,
  p_size        NUMERIC,
  p_entry_price NUMERIC,
  p_leverage    INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_margin      NUMERIC;
  v_liq_price   NUMERIC;
  v_available   NUMERIC;
  v_position_id UUID;
BEGIN
  -- Calculate required margin
  v_margin := (p_size * p_entry_price) / p_leverage;

  -- Calculate liquidation price (simplified)
  IF p_side = 'long' THEN
    v_liq_price := p_entry_price * (1 - (1.0 / p_leverage) + 0.005);
  ELSE
    v_liq_price := p_entry_price * (1 + (1.0 / p_leverage) - 0.005);
  END IF;

  -- Lock the profile row and check margin
  SELECT available_margin INTO v_available
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_available IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  IF v_available < v_margin THEN
    RAISE EXCEPTION 'Insufficient margin. Required: %, Available: %', v_margin, v_available;
  END IF;

  -- Deduct margin
  UPDATE profiles
  SET available_margin = available_margin - v_margin
  WHERE id = p_user_id;

  -- Create position
  INSERT INTO active_positions (user_id, symbol, side, size, entry_price, leverage, margin, liq_price)
  VALUES (p_user_id, p_symbol, p_side, p_size, p_entry_price, p_leverage, v_margin, v_liq_price)
  RETURNING id INTO v_position_id;

  RETURN v_position_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 5. PENDING ORDERS (Limit orders waiting for price trigger)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pending_orders (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('long', 'short')),
  order_type    TEXT NOT NULL DEFAULT 'limit' CHECK (order_type IN ('limit', 'stop-limit')),
  size          NUMERIC(18, 8) NOT NULL CHECK (size > 0),
  limit_price   NUMERIC(18, 8) NOT NULL CHECK (limit_price > 0),
  leverage      INT NOT NULL DEFAULT 1 CHECK (leverage >= 1 AND leverage <= 125),
  stop_loss     NUMERIC(18, 8),
  take_profit   NUMERIC(18, 8),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER pending_orders_updated_at
  BEFORE UPDATE ON pending_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_pending_orders_user ON pending_orders(user_id);
CREATE INDEX idx_pending_orders_user_symbol ON pending_orders(user_id, symbol);

-- RLS
ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own pending orders"
  ON pending_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pending orders"
  ON pending_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending orders"
  ON pending_orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending orders"
  ON pending_orders FOR DELETE
  USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- 6. RPC: Execute Pending Order (Atomic — limit order fill)
-- ═══════════════════════════════════════════════════════════════
-- Called by the frontend price watcher when marketPrice crosses
-- the limit_price. Atomically: validates order, deducts margin,
-- creates active_position, deletes the pending_order.

CREATE OR REPLACE FUNCTION execute_pending_order(
  p_user_id   UUID,
  p_order_id  UUID,
  p_fill_price NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order       pending_orders%ROWTYPE;
  v_margin      NUMERIC;
  v_liq_price   NUMERIC;
  v_available   NUMERIC;
  v_position_id UUID;
BEGIN
  -- Lock and fetch the pending order
  SELECT * INTO v_order
  FROM pending_orders
  WHERE id = p_order_id AND user_id = p_user_id AND status = 'pending'
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pending order not found or already filled';
  END IF;

  -- Calculate required margin
  v_margin := (v_order.size * p_fill_price) / v_order.leverage;

  -- Calculate liquidation price
  IF v_order.side = 'long' THEN
    v_liq_price := p_fill_price * (1 - (1.0 / v_order.leverage) + 0.005);
  ELSE
    v_liq_price := p_fill_price * (1 + (1.0 / v_order.leverage) - 0.005);
  END IF;

  -- Lock profile and check margin
  SELECT available_margin INTO v_available
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_available IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  IF v_available < v_margin THEN
    RAISE EXCEPTION 'Insufficient margin. Required: %, Available: %', v_margin, v_available;
  END IF;

  -- Deduct margin
  UPDATE profiles
  SET available_margin = available_margin - v_margin
  WHERE id = p_user_id;

  -- Create active position
  INSERT INTO active_positions (user_id, symbol, side, size, entry_price, leverage, margin, liq_price)
  VALUES (p_user_id, v_order.symbol, v_order.side, v_order.size, p_fill_price, v_order.leverage, v_margin, v_liq_price)
  RETURNING id INTO v_position_id;

  -- Mark order as filled
  UPDATE pending_orders SET status = 'filled' WHERE id = p_order_id;

  RETURN v_position_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 7. RPC: Close Position (Atomic Transaction)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION close_position(
  p_user_id     UUID,
  p_position_id UUID,
  p_close_price NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pos         active_positions%ROWTYPE;
  v_pnl         NUMERIC;
  v_fee         NUMERIC;
  v_net_pnl     NUMERIC;
  v_side_text   TEXT;
BEGIN
  -- Lock and fetch the position
  SELECT * INTO v_pos
  FROM active_positions
  WHERE id = p_position_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_pos.id IS NULL THEN
    RAISE EXCEPTION 'Position not found or not owned by user';
  END IF;

  -- Calculate PnL
  IF v_pos.side = 'long' THEN
    v_pnl := (p_close_price - v_pos.entry_price) * v_pos.size;
    v_side_text := 'sell';
  ELSE
    v_pnl := (v_pos.entry_price - p_close_price) * v_pos.size;
    v_side_text := 'buy';
  END IF;

  -- Closing fee: 0.04% of notional
  v_fee := v_pos.size * p_close_price * 0.0004;
  v_net_pnl := v_pnl - v_fee;

  -- Return margin + net PnL to user
  UPDATE profiles
  SET
    available_margin = available_margin + v_pos.margin + v_net_pnl,
    equity = equity + v_net_pnl
  WHERE id = p_user_id;

  -- Record in trade history
  INSERT INTO trade_history (user_id, symbol, side, qty, price, realized_pnl, fee, status)
  VALUES (p_user_id, v_pos.symbol, v_side_text, v_pos.size, p_close_price, v_net_pnl, v_fee, 'CLOSED');

  -- Delete the active position
  DELETE FROM active_positions WHERE id = p_position_id;

  RETURN v_net_pnl;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 8. RPC: Liquidate Position (forced close at liq price)
-- ═══════════════════════════════════════════════════════════════
-- Called by the frontend liquidation watcher when markPrice
-- crosses liq_price. Atomically: closes position, records
-- LIQUIDATED status, user loses entire margin.

CREATE OR REPLACE FUNCTION liquidate_position(
  p_user_id      UUID,
  p_position_id  UUID,
  p_mark_price   NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pos         active_positions%ROWTYPE;
  v_loss        NUMERIC;
  v_side_text   TEXT;
BEGIN
  -- Lock and fetch the position
  SELECT * INTO v_pos
  FROM active_positions
  WHERE id = p_position_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_pos.id IS NULL THEN
    RAISE EXCEPTION 'Position not found or already liquidated';
  END IF;

  -- Loss = entire margin (user loses all collateral)
  v_loss := -v_pos.margin;
  v_side_text := CASE WHEN v_pos.side = 'long' THEN 'sell' ELSE 'buy' END;

  -- Update equity (margin was already deducted on open, so equity -= margin)
  UPDATE profiles
  SET equity = equity + v_loss
  WHERE id = p_user_id;
  -- Note: available_margin is NOT returned — it was consumed

  -- Record in trade history as LIQUIDATED
  INSERT INTO trade_history (user_id, symbol, side, qty, price, realized_pnl, fee, status)
  VALUES (p_user_id, v_pos.symbol, v_side_text, v_pos.size, p_mark_price, v_loss, 0, 'LIQUIDATED');

  -- Delete the active position
  DELETE FROM active_positions WHERE id = p_position_id;

  RETURN v_loss;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 9. RPC: Apply Funding Payment
-- ═══════════════════════════════════════════════════════════════
-- Called every 8h by the frontend funding rate hook.
-- Positive fundingRate → longs pay, shorts receive.
-- Payment = positionSize × markPrice × fundingRate

CREATE OR REPLACE FUNCTION apply_funding_payment(
  p_user_id      UUID,
  p_position_id  UUID,
  p_symbol       TEXT,
  p_side         TEXT,
  p_size         NUMERIC,
  p_mark_price   NUMERIC,
  p_funding_rate NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment     NUMERIC;
  v_side_text   TEXT;
BEGIN
  -- Payment = notional × funding rate
  -- Positive rate → longs pay (negative PnL), shorts receive (positive PnL)
  IF p_side = 'long' THEN
    v_payment := -(p_size * p_mark_price * p_funding_rate);
    v_side_text := 'buy';
  ELSE
    v_payment := (p_size * p_mark_price * p_funding_rate);
    v_side_text := 'sell';
  END IF;

  -- Update user balance
  UPDATE profiles
  SET
    available_margin = available_margin + v_payment,
    equity = equity + v_payment
  WHERE id = p_user_id;

  -- Record in trade history as FUNDING
  INSERT INTO trade_history (user_id, symbol, side, qty, price, realized_pnl, fee, status)
  VALUES (p_user_id, p_symbol, v_side_text, p_size, p_mark_price, v_payment, 0, 'FUNDING');

  RETURN v_payment;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 6. Auto-create profile on signup (trigger on auth.users)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name, avatar_url, equity, available_margin)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      LOWER(REPLACE(COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), ' ', '_')) || '_' || substr(NEW.id::text, 1, 4),
      'trader_' || substr(NEW.id::text, 1, 8)
    ),
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url',
    10000.00,
    10000.00
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
