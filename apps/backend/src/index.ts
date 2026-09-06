import { serve } from '@hono/node-server'
import { createApp } from './app'
import { assertKlimaRetireModeSafe, klimaRetireMode } from './klima/config'

// Fail closed before accepting traffic if fake retire is wired to production.
assertKlimaRetireModeSafe()

const app = createApp()
const port = Number(process.env.PORT) || 3000

console.log(`Server is running on port ${port} (klima retire: ${klimaRetireMode()})`)

serve({
  fetch: app.fetch,
  port,
})
