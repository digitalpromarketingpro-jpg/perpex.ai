// ─────────────────────────────────────────────────────────────
// Supabase Client — singleton instance for browser-side usage.
// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
// environment variables to be set.
//
// In development without Supabase credentials, the client is
// created with placeholder values. All data operations will
// gracefully fail and the UI will show local/mock state.
// ─────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  ""

let _client: SupabaseClient<Database> | null = null
let _warned = false

/**
 * Returns a singleton Supabase client instance.
 * Returns null if credentials are not configured.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    if (process.env.NODE_ENV === "development" && !_warned) {
      _warned = true
      console.warn(
        "[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
        "Copy .env.example → .env.local and fill in your project credentials.\n" +
        "Running in local-only mode (mock data)."
      )
    }
    return null
  }

  if (!_client) {
    _client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  }

  return _client
}

/**
 * Check if Supabase is configured and available.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}
