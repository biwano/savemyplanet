import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { requireEnv } from '../config'
import * as schema from './schema/index'

const client = neon(requireEnv('DATABASE_URL'))

export const db = drizzle({ client, schema })
