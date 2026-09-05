import { createApp } from '../app'

/** Build the Hono app for `app.request(...)` route tests. */
export function createTestApp() {
  return createApp()
}
