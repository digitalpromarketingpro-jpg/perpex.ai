// ─────────────────────────────────────────────────────────────
// RAF-based update batching for high-frequency data streams.
// Ensures the UI never re-renders faster than the display refresh
// rate (~60fps / 16.6ms), preventing frame drops in the order book.
// ─────────────────────────────────────────────────────────────

/**
 * Creates a RAF-throttled callback. Incoming calls are coalesced:
 * only the latest value is flushed once per animation frame.
 *
 * @example
 * const throttled = createRAFThrottle<OrderBookData>((book) => {
 *   dispatch({ type: "UPDATE_ORDER_BOOK", payload: book })
 * })
 * ws.onmessage = (e) => throttled.schedule(parseBook(e.data))
 * // on cleanup: throttled.cancel()
 */
export function createRAFThrottle<T>(callback: (data: T) => void) {
  let latestData: T | undefined
  let rafId: number | null = null

  function flush() {
    rafId = null
    if (latestData !== undefined) {
      callback(latestData)
      latestData = undefined
    }
  }

  return {
    schedule(data: T): void {
      latestData = data
      if (rafId === null) {
        rafId = requestAnimationFrame(flush)
      }
    },
    cancel(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
      latestData = undefined
    },
  }
}

/**
 * Interval-based throttle for lower-priority streams (e.g. watchlist).
 * Coalesces updates and flushes at a fixed interval.
 */
export function createIntervalThrottle<T>(
  callback: (data: T) => void,
  intervalMs: number,
) {
  let latestData: T | undefined
  let timerId: ReturnType<typeof setInterval> | null = null

  function start() {
    if (timerId !== null) return
    timerId = setInterval(() => {
      if (latestData !== undefined) {
        callback(latestData)
        latestData = undefined
      }
    }, intervalMs)
  }

  return {
    schedule(data: T): void {
      latestData = data
      start()
    },
    cancel(): void {
      if (timerId !== null) {
        clearInterval(timerId)
        timerId = null
      }
      latestData = undefined
    },
  }
}
