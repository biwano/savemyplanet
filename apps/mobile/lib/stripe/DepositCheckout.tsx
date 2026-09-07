import { useStripe } from '@stripe/stripe-react-native'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'

import { Button, ErrorBanner } from '@/components/ui'
import { colors, spacing, typography } from '@/lib/theme'

type Props = {
  clientSecret: string
  onSuccess: () => void
  onCancel: () => void
}

/** Native PaymentSheet. Web override: `DepositCheckout.web.tsx`. */
export function DepositCheckout({ clientSecret, onSuccess, onCancel }: Props) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'ClearMyCarbon',
        paymentIntentClientSecret: clientSecret,
      })
      if (initError) {
        setError(initError.message)
        return
      }
      setReady(true)
    })()
  }, [clientSecret, initPaymentSheet])

  async function onPay() {
    setBusy(true)
    setError(null)
    try {
      const { error: presentError } = await presentPaymentSheet()
      if (presentError) {
        if (presentError.code === 'Canceled') {
          onCancel()
          return
        }
        setError(presentError.message)
        return
      }
      onSuccess()
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <ErrorBanner message={error} />
      {!ready ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Text style={typography.muted}>
            Card details are collected in Stripe’s payment sheet.
          </Text>
          <Button
            label={busy ? 'Opening…' : 'Pay'}
            onPress={() => void onPay()}
            disabled={busy}
          />
          <Button label="Cancel" onPress={onCancel} variant="secondary" />
        </>
      )}
    </View>
  )
}
