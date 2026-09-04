type CacheEntry<T> = {
  expiresAt: number
  value?: T
  /** Shared in-flight load so concurrent callers run `load` once. */
  pending?: Promise<T>
}

export type TtlCache<T> = {
  getOrSet(key: string, load: () => Promise<T>): Promise<T>
  clear(): void
}

export type TtlCacheOptions = {
  /**
   * TTL in ms. `0` disables caching (always calls `load`).
   * Negative values are treated as `0`.
   */
  ttlMs: number | (() => number)
}

/**
 * Tiny in-process TTL cache with in-flight coalescing.
 * Prefer this over a dependency until we need LRU eviction or a shared store.
 */
export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const entries = new Map<string, CacheEntry<T>>()

  function resolveTtlMs(): number {
    const raw = typeof options.ttlMs === 'function' ? options.ttlMs() : options.ttlMs
    return raw > 0 ? raw : 0
  }

  return {
    async getOrSet(key, load) {
      const ttlMs = resolveTtlMs()
      if (ttlMs <= 0) {
        return load()
      }

      const now = Date.now()
      const hit = entries.get(key)
      if (hit) {
        if (hit.value !== undefined && hit.expiresAt > now) {
          return hit.value
        }
        if (hit.pending) {
          return hit.pending
        }
      }

      const pending = load()
      entries.set(key, { expiresAt: 0, pending })

      try {
        const value = await pending
        entries.set(key, { expiresAt: Date.now() + ttlMs, value })
        return value
      } catch (err) {
        entries.delete(key)
        throw err
      }
    },

    clear() {
      entries.clear()
    },
  }
}
