// ─────────────────────────────────────────────────────────────
// TradeEngine — barrel export for all pure trading math functions
// ─────────────────────────────────────────────────────────────

export {
  calcInitialMargin,
  calcMaintenanceMargin,
  calcLiquidationPrice,
  calcUnrealizedPnl,
  calcPnlPercent,
  calcROE,
  calcMaxPositionSize,
  calcOrderCost,
  calcEffectiveLeverage,
  calcMarginRatio,
} from "./margin-calculator"
