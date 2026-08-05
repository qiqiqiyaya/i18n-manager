import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    coverage: {
      include: [
        'src/lib/utils.ts',
        'src/lib/validation.ts',
        'src/stores/editorStore.ts',
        'src/stores/collaborationStore.ts',
        'src/hooks/useSearch.ts',
        'src/components/common/SearchHighlight.tsx',
        'src/lib/data-layer/io.ts',
      ],
      thresholds: {
        statements: 99,
        branches: 95,
        functions: 100,
        lines: 99,
      },
    },
  },
});
