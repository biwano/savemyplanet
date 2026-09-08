import { useMemo, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import { spacing } from '@/lib/theme'

import { FormContext, type FormContextValue } from './formContext'

type FormProps = {
  children: ReactNode
  onSubmit: () => void
  /** When true, Enter and submit buttons no-op (same enablement as the primary CTA). */
  disabled?: boolean
}

export function Form({ children, onSubmit, disabled = false }: FormProps) {
  const value = useMemo<FormContextValue>(
    () => ({
      submit: () => {
        if (disabled) return
        onSubmit()
      },
      disabled,
    }),
    [disabled, onSubmit],
  )

  if (Platform.OS === 'web') {
    return (
      <FormContext.Provider value={value}>
        <form
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault()
            value.submit()
          }}
          style={formWebStyle}
        >
          {children}
        </form>
      </FormContext.Provider>
    )
  }

  return (
    <FormContext.Provider value={value}>
      <View style={styles.form}>{children}</View>
    </FormContext.Provider>
  )
}

const formWebStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: spacing.md,
  margin: 0,
  padding: 0,
  border: 'none',
  minWidth: 0,
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
})
