import { serve } from '@hono/node-server'
import { createApp } from './app'

const app = createApp()
const port = Number(process.env.PORT) || 3000

console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
