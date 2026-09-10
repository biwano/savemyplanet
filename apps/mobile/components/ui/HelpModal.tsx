import type { ReactNode } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import { colors, spacing, typography } from '@/lib/theme'

import { Button } from './Button'

type HelpModalProps = {
  visible: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** Simple centered help sheet — dismiss via Close or backdrop tap. */
export function HelpModal({
  visible,
  title,
  onClose,
  children,
}: HelpModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss help"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
        <View
          style={styles.card}
          accessible
          accessibilityViewIsModal
          accessibilityLabel={title}
        >
          <Text style={typography.title} accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.body}>{children}</View>
          <Button label="Close" onPress={onClose} variant="secondary" />
        </View>
      </View>
    </Modal>
  )
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
  },
  body: {
    gap: spacing.sm,
  },
})
