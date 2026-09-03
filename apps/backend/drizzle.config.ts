import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

const envCandidates = [
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '.env'),
]
for (const path of envCandidates) {
  if (existsSync(path)) {
    process.loadEnvFile(path)
    break
  }
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set')
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
