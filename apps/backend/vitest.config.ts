import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Route tests use Hono `app.request`; keep them isolated per file.
    pool: 'forks',
    // Shared Neon + C1 headroom sums all `submitted` rows globally. Parallel
    // files that leave submitted (e.g. ambiguous Klima) race headroom admits.
    fileParallelism: false,
  },
})
