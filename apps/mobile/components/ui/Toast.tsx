import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSegments } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { tabBarHeight } from '@/lib/tabBar'
import { colors, spacing } from '@/lib/theme'

type ToastContextValue = {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DISMISS_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((next: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(next)
    timerRef.current = setTimeout(() => {
      setMessage(null)
      timerRef.current = null
    }, DISMISS_MS)
  }, [])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost message={message} />
    </ToastContext.Provider>
  )
}

function ToastHost({ message }: { message: string | null }) {
  const insets = useSafeAreaInsets()
  const segments = useSegments()
  const inAppTabs = segments[0] === '(app)'

  if (!message) return null

  // Keep the toast above the tab bar when signed in; otherwise just clear the home indicator.
  const bottomClearance = inAppTabs
    ? tabBarHeight(insets.bottom) + spacing.sm
    : Math.max(insets.bottom, spacing.md) + spacing.sm

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden={false}
      importantForAccessibility="yes"
      style={[styles.host, { paddingBottom: bottomClearance }]}
    >
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={styles.toast}
      >
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  toast: {
    maxWidth: 420,
    width: '100%',
    backgroundColor: colors.accentSoft,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  text: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
})
