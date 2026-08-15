// ─────────────────────────────────────────────────────────────
// Order Validation — Zod schemas for client-side order validation.
// Guarantees no malformed order reaches the execution layer.
// Every field is validated with domain-specific constraints.
// ─────────────────────────────────────────────────────────────

import { z } from "zod"

// ── Base constraints ────────────────────────────────────────

const positiveNumber = z.number().positive("Deve ser maior que zero")
const nonNegativeNumber = z.number().min(0, "Não pode ser negativo")

const symbolSchema = z.enum([
  "BTC-PERP", "ETH-PERP", "SOL-PERP", "BNB-PERP", "ARB-PERP",
  "DOGE-PERP", "AVAX-PERP", "LINK-PERP", "OP-PERP", "INJ-PERP",
], { errorMap: () => ({ message: "Símbolo inválido" }) })

const orderSideSchema = z.enum(["buy", "sell"], {
  errorMap: () => ({ message: "Lado da ordem inválido" }),
})

const orderTypeSchema = z.enum(["limit", "market", "stop-limit"], {
  errorMap: () => ({ message: "Tipo de ordem inválido" }),
})

// ── Limit Order Schema ──────────────────────────────────────

export const limitOrderSchema = z.object({
  type: z.literal("limit"),
  symbol: symbolSchema,
  side: orderSideSchema,
  price: positiveNumber.refine(
    (v) => v > 0,
    { message: "Preço limite é obrigatório" },
  ),
  quantity: positiveNumber.refine(
    (v) => v >= 0.0001,
    { message: "Quantidade mínima: 0.0001" },
  ),
  leverage: z.number().int().min(1).max(125, "Alavancagem máxima: 125x"),
})

// ── Market Order Schema ─────────────────────────────────────

export const marketOrderSchema = z.object({
  type: z.literal("market"),
  symbol: symbolSchema,
  side: orderSideSchema,
  quantity: positiveNumber.refine(
    (v) => v >= 0.0001,
    { message: "Quantidade mínima: 0.0001" },
  ),
  leverage: z.number().int().min(1).max(125, "Alavancagem máxima: 125x"),
})

// ── Stop-Limit Order Schema ─────────────────────────────────

export const stopLimitOrderSchema = z.object({
  type: z.literal("stop-limit"),
  symbol: symbolSchema,
  side: orderSideSchema,
  price: positiveNumber.refine(
    (v) => v > 0,
    { message: "Preço limite é obrigatório" },
  ),
  stopPrice: positiveNumber.refine(
    (v) => v > 0,
    { message: "Preço stop é obrigatório" },
  ),
  quantity: positiveNumber.refine(
    (v) => v >= 0.0001,
    { message: "Quantidade mínima: 0.0001" },
  ),
  leverage: z.number().int().min(1).max(125, "Alavancagem máxima: 125x"),
})

// ── Discriminated Union ─────────────────────────────────────

export const orderSchema = z.discriminatedUnion("type", [
  limitOrderSchema,
  marketOrderSchema,
  stopLimitOrderSchema,
])

export type LimitOrderInput = z.infer<typeof limitOrderSchema>
export type MarketOrderInput = z.infer<typeof marketOrderSchema>
export type StopLimitOrderInput = z.infer<typeof stopLimitOrderSchema>
export type OrderInput = z.infer<typeof orderSchema>

// ── Validation helper with typed errors ─────────────────────

export interface ValidationResult<T> {
  success: boolean
  data?: T
  errors?: Record<string, string>
}

/**
 * Validate an order input against the appropriate schema.
 * Returns typed errors keyed by field name for UI display.
 */
export function validateOrder(input: unknown): ValidationResult<OrderInput> {
  const result = orderSchema.safeParse(input)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join(".")
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }

  return { success: false, errors }
}

// ── Cross-field validators (post-schema) ────────────────────

/**
 * Validates business logic constraints that span multiple fields.
 * Run after schema validation passes.
 */
export function validateOrderBusinessRules(
  order: OrderInput,
  context: {
    marketPrice: number
    availableBalance: number
    maxLeverage?: number
  },
): ValidationResult<OrderInput> {
  const errors: Record<string, string> = {}

  // Check sufficient balance
  const notionalValue =
    order.type === "market"
      ? order.quantity * context.marketPrice
      : order.quantity * order.price
  const requiredMargin = notionalValue / order.leverage
  const estimatedFee = notionalValue * 0.0004

  if (requiredMargin + estimatedFee > context.availableBalance) {
    errors["quantity"] = `Margem insuficiente. Necessário: ${(requiredMargin + estimatedFee).toFixed(2)} USDT`
  }

  // Stop-limit: stop price must make sense relative to market
  if (order.type === "stop-limit") {
    if (order.side === "buy" && order.stopPrice <= context.marketPrice) {
      errors["stopPrice"] = "Stop de compra deve ser acima do preço de mercado"
    }
    if (order.side === "sell" && order.stopPrice >= context.marketPrice) {
      errors["stopPrice"] = "Stop de venda deve ser abaixo do preço de mercado"
    }
  }

  // Limit order: warn on extreme deviation from market
  if (order.type === "limit") {
    const deviation = Math.abs(order.price - context.marketPrice) / context.marketPrice
    if (deviation > 0.1) {
      errors["price"] = "Preço limite com desvio > 10% do mercado"
    }
  }

  // Max leverage check
  if (context.maxLeverage && order.leverage > context.maxLeverage) {
    errors["leverage"] = `Alavancagem máxima para este par: ${context.maxLeverage}x`
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors }
  }

  return { success: true, data: order }
}
