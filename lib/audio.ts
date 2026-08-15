// ─────────────────────────────────────────────────────────────
// Centralized Audio — respects Chrome autoplay policy.
//
// Chrome blocks AudioContext creation until the user has made a
// gesture (click/tap/keydown). This module:
//   1. Listens for the first user gesture and "unlocks" audio
//   2. Reuses a single AudioContext across the entire app
//   3. Exposes typed playSound / playLiquidationSound helpers
//
// Works on localhost and Vercel — no external audio files needed.
// ─────────────────────────────────────────────────────────────

let _ctx: AudioContext | null = null
let _unlocked = false

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!_unlocked) return null

  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AudioContext()
  }

  // Resume if suspended (can happen after tab backgrounding)
  if (_ctx.state === "suspended") {
    _ctx.resume().catch(() => {})
  }

  return _ctx
}

/**
 * Must be called once on the first user gesture.
 * After this, all playSound calls will work.
 */
function unlock() {
  if (_unlocked) return
  _unlocked = true

  // Create + resume the context immediately during the gesture
  if (typeof window !== "undefined") {
    _ctx = new AudioContext()
    if (_ctx.state === "suspended") {
      _ctx.resume().catch(() => {})
    }
  }

  // Clean up listeners
  document.removeEventListener("click", unlock, true)
  document.removeEventListener("touchstart", unlock, true)
  document.removeEventListener("keydown", unlock, true)
}

/**
 * Install gesture listeners. Call this once from a top-level component.
 * Safe to call multiple times — only installs once.
 */
let _installed = false
export function installAudioUnlock() {
  if (typeof window === "undefined") return
  if (_installed) return
  _installed = true

  document.addEventListener("click", unlock, { capture: true, once: false })
  document.addEventListener("touchstart", unlock, { capture: true, once: false })
  document.addEventListener("keydown", unlock, { capture: true, once: false })
}

// ── Sound presets ─────────────────────────────────────────────

function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return true
  return localStorage.getItem("perpex-sound") !== "false"
}

export function playSound(type: "success" | "warning" | "error") {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const t = ctx.currentTime

    if (type === "success") {
      osc.frequency.setValueAtTime(523, t)        // C5
      osc.frequency.setValueAtTime(659, t + 0.08)  // E5
      osc.frequency.setValueAtTime(784, t + 0.16)  // G5
      gain.gain.setValueAtTime(0.12, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
      osc.start(t)
      osc.stop(t + 0.3)
    } else if (type === "warning") {
      osc.frequency.setValueAtTime(660, t)
      osc.frequency.setValueAtTime(440, t + 0.1)
      gain.gain.setValueAtTime(0.1, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
      osc.start(t)
      osc.stop(t + 0.3)
    } else {
      osc.frequency.setValueAtTime(200, t)
      osc.frequency.linearRampToValueAtTime(150, t + 0.25)
      gain.gain.setValueAtTime(0.15, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      osc.start(t)
      osc.stop(t + 0.35)
    }
  } catch {
    // silent fallback
  }
}

export function playLiquidationSound() {
  if (!isSoundEnabled()) return
  const ctx = getAudioContext()
  if (!ctx) return

  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    const t = ctx.currentTime
    // Low ominous buzz — two descending tones
    osc.frequency.setValueAtTime(180, t)
    osc.frequency.linearRampToValueAtTime(100, t + 0.5)
    gain.gain.setValueAtTime(0.2, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    osc.start(t)
    osc.stop(t + 0.6)
  } catch {
    // silent fallback
  }
}
