import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@relai/db': path.resolve(__dirname, '../../packages/db/src'),
      '@relai/db/react': path.resolve(__dirname, '../../packages/db/src/react/provider'),
      '@relai/core': path.resolve(__dirname, '../../packages/core/src'),
      '@relai/config': path.resolve(__dirname, '../../packages/config/src'),
    },
  },
});
