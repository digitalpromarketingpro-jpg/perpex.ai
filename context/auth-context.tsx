"use client"

// ─────────────────────────────────────────────────────────────
// AuthContext — manages Supabase Auth session state.
//
// Listens to onAuthStateChange for real-time session updates.
// Exposes user, session, loading state, and auth actions.
// When Supabase is not configured, falls back to unauthenticated
// spectator mode (chart + orderbook visible, trading blocked).
// ─────────────────────────────────────────────────────────────

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"
import type { User, Session } from "@supabase/supabase-js"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import {
  signUp as authSignUp,
  signInWithPassword as authSignIn,
  signInWithGoogle as authSignInWithGoogle,
  signOut as authSignOut,
  type AuthResult,
} from "@/lib/supabase/auth"
import { logger } from "@/lib/logger"

// ── Types ────────────────────────────────────────────────────

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  isAuthenticated: boolean
}

interface AuthActions {
  signUp: (email: string, password: string, username: string) => Promise<AuthResult>
  signIn: (email: string, password: string) => Promise<AuthResult>
  signInWithGoogle: () => Promise<AuthResult>
  signOut: () => Promise<{ success: boolean; error?: string }>
}

interface AuthContextValue {
  auth: AuthState
  authActions: AuthActions
}

// ── Context ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  // Bootstrap: get initial session + subscribe to changes
  useEffect(() => {
    const client = getSupabaseClient()

    if (!client) {
      // Supabase not configured — spectator mode
      setLoading(false)
      return
    }

    // Get initial session
    client.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      setUser(initialSession?.user ?? null)
      setLoading(false)
    })

    // Subscribe to auth state changes
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (event, newSession) => {
        logger.info("[AuthContext] onAuthStateChange", {
          event,
          userId: newSession?.user?.id ?? null,
          email: newSession?.user?.email ?? null,
          provider: newSession?.user?.app_metadata?.provider ?? null,
        })
        setSession(newSession)
        setUser(newSession?.user ?? null)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // ── Actions ────────────────────────────────────────────────

  const signUp = useCallback(
    async (email: string, password: string, username: string) => {
      return authSignUp(email, password, username)
    },
    []
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      return authSignIn(email, password)
    },
    []
  )

  const signInWithGoogle = useCallback(async () => {
    return authSignInWithGoogle()
  }, [])

  const signOut = useCallback(async () => {
    const result = await authSignOut()
    if (result.success) {
      setUser(null)
      setSession(null)
    }
    return result
  }, [])

  // ── Memoized value ─────────────────────────────────────────

  const auth = useMemo<AuthState>(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: !!user,
    }),
    [user, session, loading]
  )

  const authActions = useMemo<AuthActions>(
    () => ({ signUp, signIn, signInWithGoogle, signOut }),
    [signUp, signIn, signInWithGoogle, signOut]
  )

  const value = useMemo<AuthContextValue>(
    () => ({ auth, authActions }),
    [auth, authActions]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>")
  }
  return ctx
}
