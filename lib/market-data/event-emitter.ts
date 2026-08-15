// ─────────────────────────────────────────────────────────────
// Typed EventEmitter — zero-dependency, generic, allocation-aware
// Designed for high-frequency financial data streams where
// listener management overhead must be minimal.
// ─────────────────────────────────────────────────────────────

type Listener<T> = (data: T) => void

export class TypedEventEmitter<EventMap extends object> {
  private _listeners = new Map<keyof EventMap, Set<Listener<any>>>()
  private _onceListeners = new Map<keyof EventMap, Set<Listener<any>>>()

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(listener)

    // Return unsubscribe function for ergonomic cleanup
    return () => this.off(event, listener)
  }

  once<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this._onceListeners.has(event)) {
      this._onceListeners.set(event, new Set())
    }
    this._onceListeners.get(event)!.add(listener)
    return () => this._onceListeners.get(event)?.delete(listener)
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this._listeners.get(event)?.delete(listener)
    this._onceListeners.get(event)?.delete(listener)
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const listeners = this._listeners.get(event)
    if (listeners) {
      for (const fn of listeners) {
        fn(data)
      }
    }

    const once = this._onceListeners.get(event)
    if (once) {
      for (const fn of once) {
        fn(data)
      }
      once.clear()
    }
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): void {
    if (event) {
      this._listeners.delete(event)
      this._onceListeners.delete(event)
    } else {
      this._listeners.clear()
      this._onceListeners.clear()
    }
  }

  listenerCount<K extends keyof EventMap>(event: K): number {
    return (this._listeners.get(event)?.size ?? 0) +
      (this._onceListeners.get(event)?.size ?? 0)
  }
}
