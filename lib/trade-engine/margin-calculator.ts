// ─────────────────────────────────────────────────────────────
// Margin Calculator — pure functions for perpetual futures math.
// All functions are side-effect free and unit-testable.
// Formulas follow the Binance USDT-M Futures specification.
// ─────────────────────────────────────────────────────────────

import type { PositionSide, OrderSide } from "@/types/trading"

// ── Initial Margin ──────────────────────────────────────────

/**
 * Calculate the initial margin required to open a position.
 * Formula: (Quantity × Entry Price) / Leverage
 */
export function calcInitialMargin(
  quantity: number,
  entryPrice: number,
  leverage: number,
): number {
  if (leverage <= 0) throw new RangeError("Leverage must be > 0")
  if (quantity <= 0) throw new RangeError("Quantity must be > 0")
  if (entryPrice <= 0) throw new RangeError("Entry price must be > 0")
  return (quantity * entryPrice) / leverage
}

// ── Maintenance Margin ──────────────────────────────────────

/**
 * Calculate the maintenance margin for a position.
 * Formula: Quantity × Entry Price × Maintenance Margin Rate
 *
 * @param maintenanceRate - Typically 0.004 (0.4%) for lower tiers
 */
export function calcMaintenanceMargin(
  quantity: number,
  markPrice: number,
  maintenanceRate: number = 0.004,
): number {
  return quantity * markPrice * maintenanceRate
}

// ── Liquidation Price ───────────────────────────────────────

/**
 * Calculate the liquidation price for a perpetual futures position.
 *
 * Long:  liqPrice = entryPrice × (1 - 1/leverage + maintenanceRate)
 * Short: liqPrice = entryPrice × (1 + 1/leverage - maintenanceRate)
 *
 * @param side - "long" or "short"
 * @param entryPrice - Average entry price
 * @param leverage - Position leverage
 * @param maintenanceRate - Maintenance margin rate (default 0.004)
 */
export function calcLiquidationPrice(
  side: PositionSide,
  entryPrice: number,
  leverage: number,
  maintenanceRate: number = 0.004,
): number {
  if (leverage <= 0) throw new RangeError("Leverage must be > 0")
  if (entryPrice <= 0) throw new RangeError("Entry price must be > 0")

  if (side === "long") {
    return entryPrice * (1 - 1 / leverage + maintenanceRate)
  }
  return entryPrice * (1 + 1 / leverage - maintenanceRate)
}

// ── Unrealized PnL ──────────────────────────────────────────

/**
 * Calculate unrealized PnL for an open position.
 *
 * Long:  PnL = Quantity × (Mark Price - Entry Price)
 * Short: PnL = Quantity × (Entry Price - Mark Price)
 */
export function calcUnrealizedPnl(
  side: PositionSide,
  quantity: number,
  entryPrice: number,
  markPrice: number,
): number {
  if (side === "long") {
    return quantity * (markPrice - entryPrice)
  }
  return quantity * (entryPrice - markPrice)
}

/**
 * Calculate unrealized PnL as a percentage of initial margin.
 */
export function calcPnlPercent(
  side: PositionSide,
  quantity: number,
  entryPrice: number,
  markPrice: number,
  leverage: number,
): number {
  const pnl = calcUnrealizedPnl(side, quantity, entryPrice, markPrice)
  const margin = calcInitialMargin(quantity, entryPrice, leverage)
  if (margin === 0) return 0
  return (pnl / margin) * 100
}

// ── ROE (Return on Equity) ──────────────────────────────────

/**
 * Calculate ROE for a leveraged position.
 * ROE = PnL% × Leverage
 */
export function calcROE(
  side: PositionSide,
  entryPrice: number,
  markPrice: number,
  leverage: number,
): number {
  const priceChange = side === "long"
    ? (markPrice - entryPrice) / entryPrice
    : (entryPrice - markPrice) / entryPrice
  return priceChange * leverage * 100
}

// ── Max Position Size ───────────────────────────────────────

/**
 * Calculate the maximum position size given available balance.
 * Formula: (Available Balance × Leverage) / Entry Price
 */
export function calcMaxPositionSize(
  availableBalance: number,
  leverage: number,
  entryPrice: number,
): number {
  if (entryPrice <= 0) return 0
  return (availableBalance * leverage) / entryPrice
}

// ── Order Cost ──────────────────────────────────────────────

/**
 * Calculate the total cost of placing an order, including fees.
 *
 * @param quantity - Order quantity
 * @param price - Limit price (or market price)
 * @param leverage - Leverage
 * @param feeRate - Taker/maker fee rate (default 0.0004 = 0.04%)
 */
export function calcOrderCost(
  quantity: number,
  price: number,
  leverage: number,
  feeRate: number = 0.0004,
): { margin: number; fee: number; total: number } {
  const notional = quantity * price
  const margin = notional / leverage
  const fee = notional * feeRate
  return {
    margin: parseFloat(margin.toFixed(4)),
    fee: parseFloat(fee.toFixed(4)),
    total: parseFloat((margin + fee).toFixed(4)),
  }
}

// ── Effective Leverage ──────────────────────────────────────

/**
 * Calculate the effective leverage of a position based on
 * current notional value and margin.
 */
export function calcEffectiveLeverage(
  quantity: number,
  markPrice: number,
  margin: number,
): number {
  if (margin <= 0) return 0
  return (quantity * markPrice) / margin
}

// ── Margin Ratio ────────────────────────────────────────────

/**
 * Calculate the margin ratio (used for liquidation warnings).
 * Formula: Maintenance Margin / Margin Balance
 * Warning threshold is typically 80%.
 */
export function calcMarginRatio(
  maintenanceMargin: number,
  marginBalance: number,
): number {
  if (marginBalance <= 0) return 100
  return (maintenanceMargin / marginBalance) * 100
}
