import type { CSSProperties } from 'react'
import { Platform, Pressable, StyleSheet, Text } from 'react-native'

import { colors, spacing } from '@/lib/theme'

import { useFormContext } from './formContext'

type ButtonProps = {
  label: string
  onPress?: () => void
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  /** Primary form CTA — uses nearest Form’s onSubmit / disabled. */
  submit?: boolean
}

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  submit = false,
}: ButtonProps) {
  const form = useFormContext()
  const isDisabled = submit ? Boolean(disabled || form?.disabled) : disabled

  function handlePress() {
    if (submit && form) {
      form.submit()
      return
    }
    onPress?.()
  }

  const labelStyle = [
    styles.buttonLabel,
    variant === 'secondary' && styles.buttonLabelSecondary,
  ]

  if (Platform.OS === 'web' && submit) {
    return (
      <button
        type="submit"
        disabled={isDisabled}
        style={{
          ...buttonWebBase,
          ...(variant === 'secondary' ? buttonWebSecondary : null),
          ...(variant === 'danger' ? buttonWebDanger : null),
          ...(isDisabled ? buttonWebDisabled : null),
        }}
      >
        <Text style={labelStyle}>{label}</Text>
      </button>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        (isDisabled || pressed) && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
      ]}
    >
      <Text style={labelStyle}>{label}</Text>
    </Pressable>
  )
}

const buttonWebBase: CSSProperties = {
  backgroundColor: colors.accent,
  borderRadius: 8,
  paddingTop: 14,
  paddingBottom: 14,
  paddingLeft: spacing.md,
  paddingRight: spacing.md,
  alignItems: 'center',
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  width: '100%',
}

const buttonWebSecondary: CSSProperties = {
  backgroundColor: colors.accentSoft,
}

const buttonWebDanger: CSSProperties = {
  backgroundColor: colors.danger,
}

const buttonWebDisabled: CSSProperties = {
  opacity: 0.45,
  cursor: 'default',
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: colors.accentSoft,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonLabelSecondary: {
    color: colors.accent,
  },
})
