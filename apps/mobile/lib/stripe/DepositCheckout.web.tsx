import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { Button, ErrorBanner } from '@/components/ui'
import { getStripePublishableKey } from '@/lib/config'
import { spacing, typography } from '@/lib/theme'

type Props = {
  clientSecret: string
  onSuccess: () => void
  onCancel: () => void
}

let stripePromise: Promise<Stripe | null> | null = null

function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(getStripePublishableKey())
  }
  return stripePromise
}

function CheckoutForm({ onSuccess, onCancel }: Omit<Props, 'clientSecret'>) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onPay() {
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    try {
      const returnUrl =
        typeof window !== 'undefined' ? window.location.href : undefined
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment(
        {
          elements,
          confirmParams: returnUrl ? { return_url: returnUrl } : undefined,
          redirect: 'if_required',
        },
      )
      if (confirmError) {
        if (confirmError.code === 'canceled') {
          onCancel()
          return
        }
        setError(confirmError.message ?? 'Payment failed')
        return
      }
      if (
        paymentIntent &&
        (paymentIntent.status === 'succeeded' ||
          paymentIntent.status === 'processing')
      ) {
        onSuccess()
        return
      }
      setError('Payment did not complete')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: spacing.md }}>
      <ErrorBanner message={error} />
      <div style={{ minHeight: 180 }}>
        <PaymentElement />
      </div>
      <Button
        label="Add funds"
        busy={busy}
        onPress={() => void onPay()}
        disabled={!stripe || !elements}
      />
      <Button label="Cancel" onPress={onCancel} variant="secondary" />
    </View>
  )
}

export function DepositCheckout({ clientSecret, onSuccess, onCancel }: Props) {
  const [stripe, setStripe] = useState<Stripe | null>(null)

  useEffect(() => {
    void getStripe().then(setStripe)
  }, [])

  if (!stripe) {
    return <Text style={typography.muted}>Loading payment form…</Text>
  }

  return (
    <Elements
      stripe={stripe}
      options={{
        clientSecret,
        appearance: { theme: 'stripe' },
      }}
    >
      <CheckoutForm onSuccess={onSuccess} onCancel={onCancel} />
    </Elements>
  )
}
