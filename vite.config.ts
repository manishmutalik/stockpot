import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // NOTE: GEMINI_API_KEY is intentionally NOT exposed here via `define`.
  // Vite's `define` does a literal text substitution into the client bundle —
  // any secret placed here ships to every visitor's browser in plaintext.
  // Gemini calls must go through a server-side route (see server.ts) that
  // reads process.env.GEMINI_API_KEY on the server only.
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Splits large, infrequently-changing vendor libraries into their
          // own chunks so browsers can cache them separately from app code
          // (which changes on every deploy). Firebase and framer-motion are
          // the two biggest contributors to the main bundle; recharts is
          // already effectively split since it's only pulled in by the
          // lazy-loaded SummaryView.
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            motion: ['motion'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
