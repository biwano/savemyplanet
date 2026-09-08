type Listener = () => void

let cachedAvailableCents: number | null = null
const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) listener()
}

/** Publish available cents so the Funds tab chrome stays in sync. */
export function publishAvailableCents(cents: number) {
  cachedAvailableCents = cents
  notify()
}

/** Drop cached balance (e.g. on sign-out) so the next session cannot leak it. */
export function clearAvailableCents() {
  cachedAvailableCents = null
  notify()
}

export function getCachedAvailableCents(): number | null {
  return cachedAvailableCents
}

export function subscribeAvailableCents(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
