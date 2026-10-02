import { defineConfig } from 'vitest/config';

// Security-rules tests. They need the Firestore emulator, so they are not part of
// `npm test`; run them with `npm run test:rules`, which starts the emulator first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/rules/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
