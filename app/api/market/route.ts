import { NextResponse } from "next/server"

// Public API route for market data (simulated)
// This demonstrates server-side routing capabilities.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol") || "BTCUSDT"

  // In a real app, this might fetch from a database or a redis cache.
  // We'll return mock data indicating the endpoint works.
  return NextResponse.json({
    symbol,
    status: "active",
    price: "60000.00",
    volume24h: "15000",
    timestamp: new Date().toISOString(),
    message: "This is a server-side API response for market data."
  })
}
