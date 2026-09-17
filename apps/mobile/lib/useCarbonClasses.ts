import { useAuth } from '@clerk/expo'
import type { APICarbonClass } from 'api-types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Image } from 'react-native'

import { ApiError, api } from '@/lib/api'

let cachedClasses: APICarbonClass[] | null = null
let inflight: Promise<APICarbonClass[]> | null = null

function prefetchClassImages(classes: APICarbonClass[]) {
  for (const c of classes) {
    if (!c.imageUrl) continue
    void Image.prefetch(c.imageUrl).catch(() => {
      // ClassModal still handles load failures via onError.
    })
  }
}

function classesErrorMessage(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : err instanceof Error
      ? err.message
      : 'Could not load technologies'
}

async function fetchCarbonClasses(
  getToken: () => Promise<string | null>,
  options?: { force?: boolean },
): Promise<APICarbonClass[]> {
  const force = options?.force === true
  if (force) cachedClasses = null
  if (!force && cachedClasses) return cachedClasses
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const token = await getToken()
      if (!token) throw new Error('Missing session token')
      const res = await api.classes(token)
      cachedClasses = res.classes
      prefetchClassImages(res.classes)
      return res.classes
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Load GET /classes for quote picker and clear-screen labels. Shared cache across screens. */
export function useCarbonClasses(options?: { preload?: boolean }) {
  const { getToken } = useAuth()
  const [classes, setClasses] = useState<APICarbonClass[]>(
    () => cachedClasses ?? [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(() => cachedClasses != null)
  const preload = options?.preload === true
  const preloadStarted = useRef(false)

  const loadClasses = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!opts?.force && cachedClasses) {
        setClasses(cachedClasses)
        setLoaded(true)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const next = await fetchCarbonClasses(getToken, opts)
        setClasses(next)
        setLoaded(true)
      } catch (err) {
        setError(classesErrorMessage(err))
      } finally {
        setLoading(false)
      }
    },
    [getToken],
  )

  useEffect(() => {
    if (!preload || preloadStarted.current) return
    preloadStarted.current = true
    // Defer past the effect's sync phase (react-hooks setState-in-effect rule).
    void Promise.resolve().then(() => loadClasses())
  }, [preload, loadClasses])

  return { classes, loading, error, loaded, loadClasses }
}
