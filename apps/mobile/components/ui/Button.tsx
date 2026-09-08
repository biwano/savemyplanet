import type { CSSProperties } from 'react'
import { Platform, Pressable, StyleSheet, Text } from 'react-native'

import { colors, spacing } from '@/lib/theme'

import { useFormContext } from './formContext'
import { RippleSpinner } from './RippleSpinner'

type ButtonProps = {
  label: string
  onPress?: () => void
  disabled?: boolean
  /** In-flight: spinner only; stable accessibility name stays `label`. */
  busy?: boolean
  variant?: 'primary' | 'secondary' | 'danger'
  /** Primary form CTA — uses nearest Form’s onSubmit / disabled. */
  submit?: boolean
}

export function Button({
  label,
  onPress,
  disabled,
  busy = false,
  variant = 'primary',
  submit = false,
}: ButtonProps) {
  const form = useFormContext()
  const isDisabled = Boolean(
    busy || disabled || (submit ? form?.disabled : false),
  )
  const spinnerColor =
    variant === 'secondary'
      ? styles.buttonLabelSecondary.color
      : styles.buttonLabel.color

  function handlePress() {
    if (busy) return
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

  const content = busy ? (
    <RippleSpinner color={spinnerColor} />
  ) : (
    <Text style={labelStyle}>{label}</Text>
  )

  if (Platform.OS === 'web' && submit) {
    return (
      <button
        type="submit"
        disabled={isDisabled}
        aria-busy={busy || undefined}
        aria-label={label}
        style={{
          ...buttonWebBase,
          ...(variant === 'secondary' ? buttonWebSecondary : null),
          ...(variant === 'danger' ? buttonWebDanger : null),
          ...(isDisabled ? buttonWebDisabled : null),
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy }}
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
      {content}
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
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
  font: 'inherit',
  width: '100%',
  minHeight: 48,
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
    justifyContent: 'center',
    minHeight: 48,
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
