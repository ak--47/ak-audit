import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    timeout: 120000, // 2 minutes timeout for BigQuery operations
    testTimeout: 120000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    globals: true,
    environment: 'node'
  }
});