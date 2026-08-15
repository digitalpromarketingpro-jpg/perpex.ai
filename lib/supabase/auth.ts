// ─────────────────────────────────────────────────────────────
// Supabase Auth — signUp, signIn, signOut wrappers.
// Returns typed results with user-friendly error messages in PT-BR.
// ─────────────────────────────────────────────────────────────

import { getSupabaseClient } from "./client"
import type { AuthError, Session, User } from "@supabase/supabase-js"
import { logger } from "@/lib/logger"

export interface AuthResult {
  success: boolean
  user?: User | null
  session?: Session | null
  error?: string
}

// ── Error message mapping ────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos",
  "Email not confirmed": "Verifique seu e-mail para confirmar o cadastro",
  "User already registered": "Este e-mail já está cadastrado",
  "Signup requires a valid password": "Senha inválida",
  "Email rate limit exceeded": "Muitas tentativas. Aguarde alguns minutos",
  "For security purposes, you can only request this after": "Aguarde antes de tentar novamente",
}

function translateError(error: AuthError): string {
  // Check for exact match first
  if (ERROR_MESSAGES[error.message]) {
    return ERROR_MESSAGES[error.message]
  }
  // Check for partial match
  for (const [key, value] of Object.entries(ERROR_MESSAGES)) {
    if (error.message.includes(key)) return value
  }
  // Fallback
  return error.message || "Erro desconhecido. Tente novamente."
}

// ── Sign Up ──────────────────────────────────────────────────

export async function signUp(
  email: string,
  password: string,
  username: string
): Promise<AuthResult> {
  const client = getSupabaseClient()
  if (!client) {
    return { success: false, error: "Supabase não configurado" }
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: { username },
    },
  })

  if (error) {
    return { success: false, error: translateError(error) }
  }

  return {
    success: true,
    user: data.user,
    session: data.session,
  }
}

// ── Sign In ──────────────────────────────────────────────────

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  const client = getSupabaseClient()
  if (!client) {
    return { success: false, error: "Supabase não configurado" }
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: translateError(error) }
  }

  return {
    success: true,
    user: data.user,
    session: data.session,
  }
}

// ── Sign Out ─────────────────────────────────────────────────

export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient()
  if (!client) {
    return { success: false, error: "Supabase não configurado" }
  }

  const { error } = await client.auth.signOut()

  if (error) {
    return { success: false, error: translateError(error) }
  }

  return { success: true }
}

// ── Sign In with Google (OAuth) ──────────────────────────────

export async function signInWithGoogle(): Promise<AuthResult> {
  const client = getSupabaseClient()
  if (!client) {
    logger.error("[Auth/Google] Supabase client not initialised", undefined, {
      hint: "Check NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    })
    return { success: false, error: "Supabase não configurado" }
  }

  // Use origin without trailing slash — Supabase appends the fragment itself
  const redirectTo =
    typeof window !== "undefined"
      ? window.location.origin
      : undefined

  logger.info("[Auth/Google] Starting OAuth flow", { redirectTo, provider: "google" })

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  })

  if (error) {
    logger.error("[Auth/Google] OAuth error", error, {
      status: (error as { status?: number }).status,
      name: error.name,
    })
    return { success: false, error: `${translateError(error)} (${error.message})` }
  }

  logger.info("[Auth/Google] OAuth initiated", { url: data?.url ?? "no URL returned" })

  // If Supabase returned a URL but did NOT redirect automatically, navigate manually
  if (data?.url && typeof window !== "undefined") {
    window.location.href = data.url
  }

  return { success: true }
}

// ── Get current session ──────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient()
  if (!client) return null

  const { data } = await client.auth.getSession()
  return data.session
}
