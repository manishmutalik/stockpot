import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Security-rules tests need the Firestore emulator; see `npm run test:rules`.
    // The phone app (mobile/) has its own dependencies and its own config; its tests run in the `mobile` CI job.
    exclude: [...configDefaults.exclude, 'test/rules/**', 'mobile/**'],
  },
});
