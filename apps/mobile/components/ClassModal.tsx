import type { APICarbonClass } from 'api-types'
import { useState } from 'react'
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { Button } from '@/components/ui/Button'
import { RippleSpinner } from '@/components/ui/RippleSpinner'
import { formatPricePerTonne } from '@/lib/format'
import { colors, spacing, typography } from '@/lib/theme'

/** Committed / draft preference: omit class on quote, or a specific Klima class. */
export type ClassChoice =
  | { kind: 'auto' }
  | { kind: 'class'; carbonClass: string; name: string }

export const DEFAULT_CLASS_CHOICE: ClassChoice = { kind: 'auto' }

export function classChoiceLabel(choice: ClassChoice): string {
  return choice.kind === 'auto' ? 'Choose for me' : choice.name
}

type ClassModalProps = {
  visible: boolean
  /** Last committed choice on Quote — seed for draft when the modal mounts. */
  committed: ClassChoice
  classes: APICarbonClass[]
  loading: boolean
  loadError: string | null
  onRetry: () => void
  onDone: (choice: ClassChoice) => void
  onCancel: () => void
}

const UNKNOWN_VALUE = ''

function choiceFromValue(
  value: string,
  classes: APICarbonClass[],
): ClassChoice {
  if (value === UNKNOWN_VALUE) return { kind: 'auto' }
  const match = classes.find((c) => c.carbonClass === value)
  if (!match) return { kind: 'auto' }
  return {
    kind: 'class',
    carbonClass: match.carbonClass,
    name: match.name,
  }
}

function valueFromChoice(choice: ClassChoice): string {
  return choice.kind === 'auto' ? UNKNOWN_VALUE : choice.carbonClass
}

/**
 * Parent should remount this when opening (e.g. `{open ? <ClassModal … /> : null}`)
 * so draft resets from `committed` without an effect.
 */
export function ClassModal({
  visible,
  committed,
  classes,
  loading,
  loadError,
  onRetry,
  onDone,
  onCancel,
}: ClassModalProps) {
  const [draft, setDraft] = useState<ClassChoice>(committed)
  const [selectOpen, setSelectOpen] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  const selectedClass =
    draft.kind === 'class'
      ? classes.find((c) => c.carbonClass === draft.carbonClass)
      : undefined

  const triggerLabel =
    selectedClass != null
      ? classOptionLabel(selectedClass)
      : classChoiceLabel(draft)

  function selectValue(value: string) {
    setDraft(choiceFromValue(value, classes))
    setSelectOpen(false)
    setImageFailed(false)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss class picker"
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
        />
        <View
          style={styles.card}
          accessible
          accessibilityViewIsModal
          accessibilityLabel="Support a technology"
        >
          <Text style={typography.title} accessibilityRole="header">
            Support a technology
          </Text>

          {loading ? (
            <View style={styles.loading}>
              <RippleSpinner color={colors.accent} size={28} />
              <Text style={typography.muted}>Loading technologies…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.loading}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Button label="Retry" variant="secondary" onPress={onRetry} />
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {Platform.OS === 'web' ? (
                <select
                  aria-label="Support a technology"
                  value={valueFromChoice(draft)}
                  onChange={(e) => selectValue(e.target.value)}
                  style={webSelectStyle}
                >
                  <option value={UNKNOWN_VALUE}>Choose for me</option>
                  {classes.map((c) => (
                    <option key={c.carbonClass} value={c.carbonClass}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Support a technology: ${triggerLabel}`}
                    accessibilityState={{ expanded: selectOpen }}
                    onPress={() => setSelectOpen((open) => !open)}
                    style={styles.selectTrigger}
                  >
                    <Text style={styles.selectTriggerText}>{triggerLabel}</Text>
                    <Text style={styles.selectChevron}>
                      {selectOpen ? '▴' : '▾'}
                    </Text>
                  </Pressable>
                  {selectOpen ? (
                    <View style={styles.selectMenu}>
                      <SelectOption
                        label="Choose for me"
                        selected={draft.kind === 'auto'}
                        onPress={() => selectValue(UNKNOWN_VALUE)}
                      />
                      {classes.map((c) => (
                        <SelectOption
                          key={c.carbonClass}
                          label={c.name}
                          selected={
                            draft.kind === 'class' &&
                            draft.carbonClass === c.carbonClass
                          }
                          onPress={() => selectValue(c.carbonClass)}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              )}

              {selectedClass?.pricePerTonne != null ? (
                <Text style={styles.selectPrice}>
                  {formatPricePerTonne(selectedClass.pricePerTonne)}
                </Text>
              ) : null}

              <View style={styles.preview}>
                {draft.kind === 'auto' ? (
                  <>
                    <NeutralPreviewImage />
                    <Text style={[typography.muted, styles.previewCopy]}>
                      We’ll pick a suitable technology for the tonnes you
                      clear.
                    </Text>
                  </>
                ) : (
                  <>
                    {selectedClass && !imageFailed ? (
                      <Image
                        accessibilityLabel={`${selectedClass.name} illustration`}
                        source={{ uri: selectedClass.imageUrl }}
                        style={styles.previewImage}
                        resizeMode="cover"
                        onError={() => setImageFailed(true)}
                      />
                    ) : (
                      <NeutralPreviewImage />
                    )}
                    <Text style={[typography.muted, styles.previewCopy]}>
                      {selectedClass?.description?.trim()
                        ? selectedClass.description
                        : 'No description'}
                    </Text>
                  </>
                )}
              </View>
            </ScrollView>
          )}

          <Button
            label="Support this technology"
            disabled={loading || !!loadError}
            onPress={() => onDone(draft)}
          />
          <Button label="Close" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  )
}

function NeutralPreviewImage() {
  return (
    <View style={[styles.previewImage, styles.neutralImage]}>
      <Text style={styles.neutralMark}>?</Text>
    </View>
  )
}

function SelectOption({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.selectOption, selected && styles.selectOptionSelected]}
    >
      <Text
        style={[
          styles.selectOptionText,
          selected && styles.selectOptionTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const webSelectStyle = {
  width: '100%',
  borderWidth: 1,
  borderColor: colors.line,
  borderStyle: 'solid' as const,
  backgroundColor: colors.surface,
  borderRadius: 8,
  padding: 12,
  fontSize: 16,
  color: colors.ink,
  fontFamily: 'inherit',
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 32, 26, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    maxHeight: '90%',
  },
  scroll: {
    flexGrow: 0,
    maxHeight: 360,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  loading: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
  selectTrigger: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectTriggerText: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
  },
  selectChevron: {
    fontSize: 14,
    color: colors.muted,
  },
  selectMenu: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  selectOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  selectOptionSelected: {
    backgroundColor: colors.accentSoft,
  },
  selectOptionText: {
    fontSize: 16,
    color: colors.ink,
  },
  selectOptionTextSelected: {
    fontWeight: '600',
    color: colors.accent,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  previewImage: {
    width: 112,
    height: 112,
    borderRadius: 10,
    backgroundColor: colors.soft,
  },
  neutralImage: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  neutralMark: {
    fontSize: 36,
    fontWeight: '600',
    color: colors.muted,
  },
  previewCopy: {
    flex: 1,
  },
  selectPrice: {
    ...typography.body,
    fontWeight: '600',
    color: colors.ink,
    marginTop: spacing.sm,
  },
})
