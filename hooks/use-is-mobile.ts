"use client"

// ─────────────────────────────────────────────────────────────
// useIsMobile — detects viewport width < breakpoint (768px).
// Uses matchMedia for efficiency + SSR-safe initial false.
// Re-evaluates on window resize via media query listener.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches)
    }
    // Set initial value
    onChange(mql)
    mql.addEventListener("change", onChange as (e: MediaQueryListEvent) => void)
    return () => mql.removeEventListener("change", onChange as (e: MediaQueryListEvent) => void)
  }, [])

  return isMobile
}
