import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'
import { requireEnv } from './src/config'

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

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: requireEnv('DATABASE_URL'),
  },
})
