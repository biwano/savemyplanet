import type { ReactNode } from 'react'
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
  /** Control to the right of the label (e.g. help). */
  labelAccessory?: ReactNode
  /** Sentence-case label instead of the default uppercase chrome label. */
  labelSentenceCase?: boolean
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
  labelAccessory,
  labelSentenceCase = false,
}: FieldProps) {
  const form = useFormContext()

  function onSubmitEditing(
    _e: NativeSyntheticEvent<TextInputSubmitEditingEventData>,
  ) {
    // Textareas never submit on Enter — only single-line fields do.
    if (multiline) return
    form?.submit()
  }

  const autoCapitalize =
    keyboardType === 'email-address' ||
    keyboardType === 'number-pad' ||
    textContentType === 'oneTimeCode'
      ? 'none'
      : 'sentences'

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text
          style={[
            labelSentenceCase ? styles.labelSentence : typography.label,
            styles.labelText,
          ]}
        >
          {label}
        </Text>
        {labelAccessory}
      </View>
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
        returnKeyType={form && !multiline ? 'done' : undefined}
        // Multiline: Enter inserts a newline. Single-line in a form: Enter submits.
        blurOnSubmit={!multiline}
        onSubmitEditing={
          form && !multiline && Platform.OS !== 'web'
            ? onSubmitEditing
            : undefined
        }
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          error ? styles.inputInvalid : null,
        ]}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.xs,
    rowGap: spacing.xs,
  },
  labelText: {
    flexShrink: 1,
  },
  labelSentence: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.ink,
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
