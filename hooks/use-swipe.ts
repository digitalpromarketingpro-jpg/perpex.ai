"use client"

// ─────────────────────────────────────────────────────────────
// useSwipe — detects horizontal swipe gestures on a ref element.
// Returns nothing; fires onSwipeLeft / onSwipeRight callbacks.
// Minimum 50px horizontal travel + faster than 300ms = valid swipe.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, type RefObject } from "react"

interface UseSwipeOptions {
  ref: RefObject<HTMLElement | null>
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  minDistance?: number
  maxTime?: number
}

export function useSwipe({
  ref,
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  maxTime = 300,
}: UseSwipeOptions) {
  const startX = useRef(0)
  const startTime = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX
      startTime.current = Date.now()
    }

    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current
      const dt = Date.now() - startTime.current

      if (dt > maxTime) return
      if (Math.abs(dx) < minDistance) return

      if (dx < 0) {
        onSwipeLeft?.()
      } else {
        onSwipeRight?.()
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchend", onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [ref, onSwipeLeft, onSwipeRight, minDistance, maxTime])
}
