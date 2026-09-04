import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { requireEnv } from '../config'
import * as schema from './schema/index'

const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') })

export const db = drizzle({ client: pool, schema })
