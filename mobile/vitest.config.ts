import { defineConfig } from 'vitest/config';

// The app's plain-logic tests (no React Native). vitest itself comes from the main project (../node_modules).
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
