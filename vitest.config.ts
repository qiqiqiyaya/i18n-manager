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
        'src/lib/monaco-edits.ts',
        'src/lib/duplicate-keys.ts',
        'src/lib/validation.ts',
        'src/stores/editorStore.ts',
        'src/stores/collaborationStore.ts',
        'src/hooks/useSearch.ts',
        'src/components/common/SearchHighlight.tsx',
        'src/lib/data-layer/io.ts',
        'src/lib/monaco-reveal.ts',
        'src/components/project/GlobalSearchResults.tsx',
        'src/lib/reference-lookup.ts',
        'src/lib/reference-state.ts',
        'src/components/project/CrossReferencePopover.tsx',
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
