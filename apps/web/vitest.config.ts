import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest config for the web app.
 *
 *  - jsdom environment so components that touch `document` / `window` can mount.
 *  - tsconfigPaths resolves the "@/..." alias the same way Next does.
 *  - testing-library/jest-dom matchers loaded in setup.
 *  - Page-level integration tests live under `app/__tests__/` so Next's own
 *    file-system router doesn't pick them up at build time.
 */
export default defineConfig({
  plugins: [react() as any, tsconfigPaths() as any],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: [
      'lib/**/*.{test,spec}.{ts,tsx}',
      'components/**/*.{test,spec}.{ts,tsx}',
      'test/**/*.{test,spec}.{ts,tsx}',
    ],
  },
});
