import { defineConfig } from 'vitest/config';

// biome-ignore lint/style/noDefaultExport: Vitest requires a default export for configuration
export default defineConfig({
  test: {
    globals: true,
    watch: false,
    passWithNoTests: true,
    environment: 'node',
    restoreMocks: true,
    mockReset: true,
    typecheck: { enabled: false },
    reporters: process.env.CI ? ['junit'] : ['default']
  }
});
