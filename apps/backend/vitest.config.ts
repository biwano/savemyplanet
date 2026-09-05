import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Route tests use Hono `app.request`; keep them isolated per file.
    pool: 'forks',
  },
})
