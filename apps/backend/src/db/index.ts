import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema/index'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.warn('DATABASE_URL is not set. Database connection will fail.')
}

export const db = drizzle(databaseUrl!, { schema })
