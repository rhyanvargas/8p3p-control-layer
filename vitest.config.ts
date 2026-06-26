import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'dashboard'),
      'next/server': path.resolve(__dirname, 'dashboard/node_modules/next/server.js'),
      // Single ai module so vi.mock('ai') applies to @8p3p/explanation imports too
      ai: path.resolve(__dirname, 'services/explanation/node_modules/ai/dist/index.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts']
    }
  }
});