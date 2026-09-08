import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from 'react-native'

import { colors, spacing, typography } from '@/lib/theme'

import { useFormContext } from './formContext'

type FieldProps = {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
  keyboardType?: 'default' | 'decimal-pad' | 'email-address' | 'number-pad'
  textContentType?: 'none' | 'emailAddress' | 'password' | 'oneTimeCode'
  autoComplete?: 'off' | 'email' | 'password' | 'one-time-code' | 'sms-otp'
  editable?: boolean
  /** Field-level validation message — shown directly below the input. */
  error?: string | null
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  keyboardType = 'default',
  textContentType,
  autoComplete,
  editable = true,
  error = null,
}: FieldProps) {
  const form = useFormContext()

  function onSubmitEditing(
    _e: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ) {
    form?.submit()
  }

  // Web multiline <textarea> does not submit forms on Enter; intercept so Enter
  // runs the form CTA (Shift+Enter keeps a newline). Single-line uses native
  // form submit via the submit button.
  const webMultilineKeyDown =
    Platform.OS === 'web' && form && multiline
      ? {
          onKeyDown: (e: {
            key: string
            shiftKey: boolean
            preventDefault: () => void
          }) => {
            if (e.key !== 'Enter' || e.shiftKey) return
            e.preventDefault()
            form.submit()
          },
        }
      : undefined

  const autoCapitalize =
    keyboardType === 'email-address' ||
    keyboardType === 'number-pad' ||
    textContentType === 'oneTimeCode'
      ? 'none'
      : 'sentences'

  return (
    <View style={styles.field}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        keyboardType={keyboardType}
        textContentType={textContentType}
        autoComplete={autoComplete}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoCorrect={textContentType === 'oneTimeCode' ? false : undefined}
        returnKeyType={form ? 'done' : undefined}
        blurOnSubmit={form ? true : !multiline}
        onSubmitEditing={
          form && Platform.OS !== 'web' ? onSubmitEditing : undefined
        }
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          error ? styles.inputInvalid : null,
        ]}
        {...webMultilineKeyDown}
      />
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  fieldError: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
})
