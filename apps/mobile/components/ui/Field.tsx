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
  keyboardType?: 'default' | 'decimal-pad' | 'email-address'
  editable?: boolean
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  keyboardType = 'default',
  editable = true,
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
        editable={editable}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
        returnKeyType={form ? 'done' : undefined}
        blurOnSubmit={form ? true : !multiline}
        onSubmitEditing={
          form && Platform.OS !== 'web' ? onSubmitEditing : undefined
        }
        style={[styles.input, multiline && styles.inputMultiline]}
        {...webMultilineKeyDown}
      />
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
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
})
