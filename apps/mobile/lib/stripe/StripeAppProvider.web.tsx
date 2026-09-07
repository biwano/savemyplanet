import type { ReactElement, ReactNode } from 'react'

/** Web uses @stripe/react-stripe-js Elements per deposit; no root StripeProvider. */
export function StripeAppProvider({
  children,
}: {
  children: ReactElement | ReactElement[]
}): ReactNode {
  return children
}
