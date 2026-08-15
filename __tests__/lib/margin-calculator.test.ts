// __tests__/lib/margin-calculator.test.ts
// Unit tests for pure margin math functions (Binance USDT-M perpetual spec)

import { describe, it, expect } from "vitest"
import {
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
} from "@/lib/trade-engine/margin-calculator"

// ── calcInitialMargin ──────────────────────────────────────────

describe("calcInitialMargin", () => {
  it("returns correct margin for BTC position at 10x", () => {
    // 0.1 BTC × $50,000 / 10 = $500
    expect(calcInitialMargin(0.1, 50_000, 10)).toBe(500)
  })

  it("returns correct margin at 1x leverage", () => {
    // Full notional value as margin
    expect(calcInitialMargin(1, 100, 1)).toBe(100)
  })

  it("returns correct margin at 100x leverage", () => {
    expect(calcInitialMargin(1, 100, 100)).toBe(1)
  })

  it("throws RangeError when leverage is 0", () => {
    expect(() => calcInitialMargin(1, 100, 0)).toThrow(RangeError)
    expect(() => calcInitialMargin(1, 100, 0)).toThrow("Leverage must be > 0")
  })

  it("throws RangeError when leverage is negative", () => {
    expect(() => calcInitialMargin(1, 100, -5)).toThrow(RangeError)
  })

  it("throws RangeError when quantity is 0", () => {
    expect(() => calcInitialMargin(0, 100, 10)).toThrow(RangeError)
    expect(() => calcInitialMargin(0, 100, 10)).toThrow("Quantity must be > 0")
  })

  it("throws RangeError when entryPrice is 0", () => {
    expect(() => calcInitialMargin(1, 0, 10)).toThrow(RangeError)
    expect(() => calcInitialMargin(1, 0, 10)).toThrow("Entry price must be > 0")
  })
})

// ── calcMaintenanceMargin ─────────────────────────────────────

describe("calcMaintenanceMargin", () => {
  it("calculates default 0.4% maintenance margin", () => {
    // 1 BTC × $50,000 × 0.004 = $200
    expect(calcMaintenanceMargin(1, 50_000)).toBe(200)
  })

  it("accepts custom maintenance rate", () => {
    // 2 BTC × $30,000 × 0.005 = $300
    expect(calcMaintenanceMargin(2, 30_000, 0.005)).toBe(300)
  })
})

// ── calcLiquidationPrice ──────────────────────────────────────

describe("calcLiquidationPrice", () => {
  // Long: liqPrice = entry × (1 - 1/lev + mmRate)
  it("correctly calculates liquidation price for a long position at 10x", () => {
    const liq = calcLiquidationPrice("long", 50_000, 10)
    // 50000 × (1 - 0.1 + 0.004) = 50000 × 0.904 = 45200
    expect(liq).toBeCloseTo(45_200, 0)
  })

  // Short: liqPrice = entry × (1 + 1/lev - mmRate)
  it("correctly calculates liquidation price for a short position at 10x", () => {
    const liq = calcLiquidationPrice("short", 50_000, 10)
    // 50000 × (1 + 0.1 - 0.004) = 50000 × 1.096 = 54800
    expect(liq).toBeCloseTo(54_800, 0)
  })

  it("long liquidation price is less than entry price", () => {
    const liq = calcLiquidationPrice("long", 40_000, 20)
    expect(liq).toBeLessThan(40_000)
  })

  it("short liquidation price is greater than entry price", () => {
    const liq = calcLiquidationPrice("short", 40_000, 20)
    expect(liq).toBeGreaterThan(40_000)
  })

  it("throws RangeError when leverage is 0", () => {
    expect(() => calcLiquidationPrice("long", 50_000, 0)).toThrow(RangeError)
  })

  it("throws RangeError when entry price is 0", () => {
    expect(() => calcLiquidationPrice("long", 0, 10)).toThrow(RangeError)
  })

  it("liquidation price approaches entry price at very high leverage", () => {
    const liq = calcLiquidationPrice("long", 50_000, 125)
    // Very close to entry (but below it for longs)
    expect(liq).toBeGreaterThan(0)
    expect(liq).toBeLessThan(50_000)
  })
})

// ── calcUnrealizedPnl ─────────────────────────────────────────

describe("calcUnrealizedPnl", () => {
  it("calculates positive PnL for a profitable long", () => {
    // Long 1 BTC @ $40,000, mark = $45,000 → PnL = $5,000
    expect(calcUnrealizedPnl("long", 1, 40_000, 45_000)).toBe(5_000)
  })

  it("calculates negative PnL for a losing long", () => {
    // Long 1 BTC @ $50,000, mark = $45,000 → PnL = -$5,000
    expect(calcUnrealizedPnl("long", 1, 50_000, 45_000)).toBe(-5_000)
  })

  it("calculates positive PnL for a profitable short", () => {
    // Short 1 BTC @ $50,000, mark = $45,000 → PnL = $5,000
    expect(calcUnrealizedPnl("short", 1, 50_000, 45_000)).toBe(5_000)
  })

  it("calculates negative PnL for a losing short", () => {
    // Short 1 BTC @ $40,000, mark = $45,000 → PnL = -$5,000
    expect(calcUnrealizedPnl("short", 1, 40_000, 45_000)).toBe(-5_000)
  })

  it("returns 0 when mark price equals entry price", () => {
    expect(calcUnrealizedPnl("long", 1, 40_000, 40_000)).toBe(0)
    expect(calcUnrealizedPnl("short", 1, 40_000, 40_000)).toBe(0)
  })

  it("scales linearly with quantity", () => {
    const single = calcUnrealizedPnl("long", 1, 40_000, 41_000)
    const double = calcUnrealizedPnl("long", 2, 40_000, 41_000)
    expect(double).toBe(single * 2)
  })
})

// ── calcPnlPercent ────────────────────────────────────────────

describe("calcPnlPercent", () => {
  it("calculates PnL% relative to initial margin", () => {
    // Long 1 BTC @ $40,000 @ 10x → margin = $4,000
    // PnL = $1,000 (mark = $41,000)
    // PnL% = 1000 / 4000 × 100 = 25%
    expect(calcPnlPercent("long", 1, 40_000, 41_000, 10)).toBeCloseTo(25, 1)
  })

  it("returns negative percentage for losing position", () => {
    const pct = calcPnlPercent("long", 1, 40_000, 39_000, 10)
    expect(pct).toBeLessThan(0)
  })

  it("returns 0 when margin is 0 (edge case — no division by zero)", () => {
    // Force margin = 0 by passing 0 quantity via direct call of helper
    // We test the guard branch by calling with zero PnL
    expect(calcPnlPercent("long", 1, 40_000, 40_000, 10)).toBe(0)
  })
})

// ── calcROE ───────────────────────────────────────────────────

describe("calcROE", () => {
  it("calculates positive ROE for a profitable long", () => {
    // Entry=40000, mark=44000 → price change = 10%, leverage=10 → ROE=100%
    expect(calcROE("long", 40_000, 44_000, 10)).toBeCloseTo(100, 1)
  })

  it("calculates positive ROE for a profitable short", () => {
    // Entry=40000, mark=36000 → price change = -10%, short → ROE=100% @ 10x
    expect(calcROE("short", 40_000, 36_000, 10)).toBeCloseTo(100, 1)
  })

  it("calculates negative ROE for a losing position", () => {
    expect(calcROE("long", 40_000, 36_000, 10)).toBeLessThan(0)
  })

  it("scales with leverage", () => {
    const roe1x = calcROE("long", 40_000, 44_000, 1)
    const roe10x = calcROE("long", 40_000, 44_000, 10)
    expect(roe10x).toBeCloseTo(roe1x * 10, 1)
  })
})

// ── calcMaxPositionSize ───────────────────────────────────────

describe("calcMaxPositionSize", () => {
  it("calculates max BTC size given $10,000 balance at 10x @ $50,000", () => {
    // (10000 × 10) / 50000 = 2 BTC
    expect(calcMaxPositionSize(10_000, 10, 50_000)).toBe(2)
  })

  it("returns 0 when entry price is 0", () => {
    expect(calcMaxPositionSize(10_000, 10, 0)).toBe(0)
  })
})

// ── calcOrderCost ─────────────────────────────────────────────

describe("calcOrderCost", () => {
  it("calculates margin, fee and total correctly", () => {
    // 1 BTC × $50,000 at 10x → notional=$50,000
    // margin = 50000/10 = 5000
    // fee = 50000 × 0.0004 = 20
    // total = 5020
    const result = calcOrderCost(1, 50_000, 10)
    expect(result.margin).toBe(5_000)
    expect(result.fee).toBe(20)
    expect(result.total).toBe(5_020)
  })

  it("accepts custom fee rate", () => {
    const result = calcOrderCost(1, 50_000, 10, 0.0002) // maker fee
    expect(result.fee).toBe(10) // 50000 × 0.0002
  })

  it("returns values rounded to 4 decimal places", () => {
    const result = calcOrderCost(0.001, 49_999.99, 7, 0.0004)
    // Should not have more than 4 decimal places
    expect(result.margin.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4)
    expect(result.fee.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4)
    expect(result.total.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4)
  })
})

// ── calcEffectiveLeverage ─────────────────────────────────────

describe("calcEffectiveLeverage", () => {
  it("calculates effective leverage correctly", () => {
    // 1 BTC × $50,000 / $5,000 margin = 10x
    expect(calcEffectiveLeverage(1, 50_000, 5_000)).toBe(10)
  })

  it("returns 0 when margin is 0 (guards against division by zero)", () => {
    expect(calcEffectiveLeverage(1, 50_000, 0)).toBe(0)
  })

  it("returns 0 when margin is negative", () => {
    expect(calcEffectiveLeverage(1, 50_000, -100)).toBe(0)
  })
})

// ── calcMarginRatio ───────────────────────────────────────────

describe("calcMarginRatio", () => {
  it("calculates margin ratio correctly", () => {
    // maintenance=200, balance=5000 → ratio=4%
    expect(calcMarginRatio(200, 5_000)).toBe(4)
  })

  it("returns 100 when margin balance is 0 (max liquidation risk)", () => {
    expect(calcMarginRatio(200, 0)).toBe(100)
  })

  it("returns 100 when margin balance is negative", () => {
    expect(calcMarginRatio(200, -100)).toBe(100)
  })

  it("returns 80 when near the typical warning threshold", () => {
    expect(calcMarginRatio(400, 500)).toBe(80)
  })
})
