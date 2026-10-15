/** Configure the React build, tooling ports, and isolated browser-like unit tests. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Resolve tooling-only environment values for the selected mode.
 * @param {object} context - Vite configuration context.
 * @param {string} context.mode - Environment mode to load.
 * @returns {object} React, server, and Vitest configuration.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: Number(env.DEV_PORT || 5173),
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: Number(env.PREVIEW_PORT || 4173),
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      clearMocks: true,
      restoreMocks: true,
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,
        },
      },
    },
  };
});
