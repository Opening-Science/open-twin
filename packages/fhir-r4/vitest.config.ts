import { defineConfig } from 'vitest/config';

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export for configuration
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    environment: 'node',
    restoreMocks: true,
    mockReset: true,
    typecheck: { enabled: false },
    hookTimeout: 20_000,
    testTimeout: 20_000,
    maxWorkers: process.env.CI ? undefined : 4,
    reporters: process.env.CI ? ['junit'] : ['default']
  }
});
