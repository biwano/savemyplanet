import { createClerkClient } from '@clerk/backend'
import { clerkPublishableKey, clerkSecretKey } from '../config'

let client: ReturnType<typeof createClerkClient> | undefined

export function getClerkClient() {
  if (!client) {
    client = createClerkClient({
      secretKey: clerkSecretKey(),
      publishableKey: clerkPublishableKey(),
    })
  }
  return client
}
