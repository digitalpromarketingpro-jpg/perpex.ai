import { calcLiquidationPrice } from "@/lib/trade-engine"
import type { Position, PositionSide, Symbol, UserBalance } from "@/types/trading"

export interface BuildPositionParams {
  id: string | number
  symbol: Symbol
  side: PositionSide
  size: number
  entryPrice: number
  leverage: number
  markPrice?: number
}

export function buildOpenPosition(params: BuildPositionParams): Position {
  const margin = (params.size * params.entryPrice) / params.leverage
  const markPrice = params.markPrice ?? params.entryPrice

  return {
    id: params.id,
    symbol: params.symbol,
    side: params.side,
    size: params.size,
    entryPrice: params.entryPrice,
    markPrice,
    pnl: 0,
    pnlPct: 0,
    leverage: params.leverage,
    liqPrice: calcLiquidationPrice(params.side, params.entryPrice, params.leverage),
    margin,
  }
}

export function applyOpenPosition(
  positions: Position[],
  userBalance: UserBalance,
  position: Position,
): { positions: Position[]; userBalance: UserBalance } {
  return {
    positions: [...positions, position],
    userBalance: {
      ...userBalance,
      available: userBalance.available - position.margin,
      inPositions: userBalance.inPositions + position.margin,
      total: userBalance.total,
    },
  }
}

export function revertOpenPosition(
  positions: Position[],
  userBalance: UserBalance,
  positionId: string | number,
): { positions: Position[]; userBalance: UserBalance } {
  const position = positions.find((p) => p.id === positionId)
  if (!position) {
    return { positions, userBalance }
  }

  return {
    positions: positions.filter((p) => p.id !== positionId),
    userBalance: {
      ...userBalance,
      available: userBalance.available + position.margin,
      inPositions: Math.max(0, userBalance.inPositions - position.margin),
      total: userBalance.total,
    },
  }
}
