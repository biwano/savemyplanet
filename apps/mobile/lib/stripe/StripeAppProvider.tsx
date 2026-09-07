import { StripeProvider } from '@stripe/stripe-react-native'
import type { ReactElement, ReactNode } from 'react'

import { hasStripePublishableKey, getStripePublishableKey } from '@/lib/config'

/** Native Stripe root provider. Web override: `StripeAppProvider.web.tsx`. */
export function StripeAppProvider({
  children,
}: {
  children: ReactElement | ReactElement[]
}): ReactNode {
  if (!hasStripePublishableKey()) {
    return children
  }
  return (
    <StripeProvider publishableKey={getStripePublishableKey()}>
      {children}
    </StripeProvider>
  )
}
