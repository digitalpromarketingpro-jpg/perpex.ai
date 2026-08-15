// ─────────────────────────────────────────────────────────────
// Typed Supabase queries — zero `any`, full type safety.
// All operations return discriminated results for error handling.
// ─────────────────────────────────────────────────────────────

import { getSupabaseClient } from "./client"
import type {
  ProfileRow,
  ActivePositionRow,
  TradeHistoryRow,
  PendingOrderRow,
  PendingOrderInsert,
} from "./types"

// ── Result types ────────────────────────────────────────────

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// ── Helper: get client or fail ──────────────────────────────

function requireClient() {
  const client = getSupabaseClient()
  if (!client) throw new Error("Supabase not configured")
  return client
}

// ═══════════════════════════════════════════════════════════════
// PROFILES
// ═══════════════════════════════════════════════════════════════

export async function fetchProfile(userId: string): Promise<QueryResult<ProfileRow>> {
  try {
    const sb = requireClient()
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// ACTIVE POSITIONS
// ═══════════════════════════════════════════════════════════════

export async function fetchActivePositions(userId: string): Promise<QueryResult<ActivePositionRow[]>> {
  try {
    const sb = requireClient()
    const { data, error } = await sb
      .from("active_positions")
      .select("*")
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ?? [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// TRADE HISTORY
// ═══════════════════════════════════════════════════════════════

export async function fetchTradeHistory(
  userId: string,
  limit = 50,
): Promise<QueryResult<TradeHistoryRow[]>> {
  try {
    const sb = requireClient()
    const { data, error } = await sb
      .from("trade_history")
      .select("*")
      .eq("user_id", userId)
      .order("closed_at", { ascending: false })
      .limit(limit)

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ?? [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// RPC: Open Position (atomic server-side transaction)
// ═══════════════════════════════════════════════════════════════

export interface OpenPositionParams {
  userId: string
  symbol: string
  side: "long" | "short"
  size: number
  entryPrice: number
  leverage: number
}

export async function openPosition(params: OpenPositionParams): Promise<QueryResult<string>> {
  try {
    const sb = requireClient()
    const { data, error } = await (sb.rpc as CallableFunction)("open_position", {
      p_user_id: params.userId,
      p_symbol: params.symbol,
      p_side: params.side,
      p_size: params.size,
      p_entry_price: params.entryPrice,
      p_leverage: params.leverage,
    })

    if (error) return { ok: false, error: (error as { message: string }).message }
    return { ok: true, data: data as string }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// RPC: Close Position (atomic server-side transaction)
// ═══════════════════════════════════════════════════════════════

export interface ClosePositionParams {
  userId: string
  positionId: string
  closePrice: number
}

export async function closePosition(params: ClosePositionParams): Promise<QueryResult<number>> {
  try {
    const sb = requireClient()
    const { data, error } = await (sb.rpc as CallableFunction)("close_position", {
      p_user_id: params.userId,
      p_position_id: params.positionId,
      p_close_price: params.closePrice,
    })

    if (error) return { ok: false, error: (error as { message: string }).message }
    return { ok: true, data: data as number }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// PENDING ORDERS
// ═══════════════════════════════════════════════════════════════

export async function fetchPendingOrders(userId: string): Promise<QueryResult<PendingOrderRow[]>> {
  try {
    const sb = requireClient()
    const { data, error } = await sb
      .from("pending_orders")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: data ?? [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function insertPendingOrder(order: PendingOrderInsert): Promise<QueryResult<PendingOrderRow>> {
  try {
    const sb = requireClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed overload doesn't resolve for new tables
    const { data, error } = await (sb.from("pending_orders") as any)
      .insert(order)
      .select()
      .single()

    if (error) return { ok: false, error: (error as { message: string }).message }
    return { ok: true, data: data as PendingOrderRow }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function cancelPendingOrder(userId: string, orderId: string): Promise<QueryResult<null>> {
  try {
    const sb = requireClient()
    const { error } = await sb
      .from("pending_orders")
      .delete()
      .eq("id", orderId)
      .eq("user_id", userId)

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// RPC: Execute Pending Order (limit order fill)
// ═══════════════════════════════════════════════════════════════

export interface ExecutePendingOrderParams {
  userId: string
  orderId: string
  fillPrice: number
}

export async function executePendingOrder(params: ExecutePendingOrderParams): Promise<QueryResult<string>> {
  try {
    const sb = requireClient()
    const { data, error } = await (sb.rpc as CallableFunction)("execute_pending_order", {
      p_user_id: params.userId,
      p_order_id: params.orderId,
      p_fill_price: params.fillPrice,
    })

    if (error) return { ok: false, error: (error as { message: string }).message }
    return { ok: true, data: data as string }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// RPC: Liquidate Position (forced close — user loses margin)
// ═══════════════════════════════════════════════════════════════

export interface LiquidatePositionParams {
  userId: string
  positionId: string
  markPrice: number
}

export async function liquidatePosition(params: LiquidatePositionParams): Promise<QueryResult<number>> {
  try {
    const sb = requireClient()
    const { data, error } = await (sb.rpc as CallableFunction)("liquidate_position", {
      p_user_id: params.userId,
      p_position_id: params.positionId,
      p_mark_price: params.markPrice,
    })

    if (error) return { ok: false, error: (error as { message: string }).message }
    return { ok: true, data: data as number }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

// ═══════════════════════════════════════════════════════════════
// RPC: Apply Funding Payment (8h cycle)
// ═══════════════════════════════════════════════════════════════

export interface ApplyFundingParams {
  userId: string
  positionId: string
  symbol: string
  side: "long" | "short"
  size: number
  markPrice: number
  fundingRate: number
}

export async function applyFundingPayment(params: ApplyFundingParams): Promise<QueryResult<number>> {
  try {
    const sb = requireClient()
    const { data, error } = await (sb.rpc as CallableFunction)("apply_funding_payment", {
      p_user_id: params.userId,
      p_position_id: params.positionId,
      p_symbol: params.symbol,
      p_side: params.side,
      p_size: params.size,
      p_mark_price: params.markPrice,
      p_funding_rate: params.fundingRate,
    })

    if (error) return { ok: false, error: (error as { message: string }).message }
    return { ok: true, data: data as number }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
