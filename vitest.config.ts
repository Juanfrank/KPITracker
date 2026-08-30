import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// `import.meta.dirname` (no `__dirname`, este archivo es ESM) — Vite avisa
// que el `configLoader: 'native'` que será default más adelante no soporta
// `__dirname` en el config.
const raiz = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve(raiz, 'src/domain'),
      '@application': resolve(raiz, 'src/application'),
      '@infrastructure': resolve(raiz, 'src/infrastructure'),
      '@shared': resolve(raiz, 'src/shared'),
      '@renderer': resolve(raiz, 'src/renderer'),
      '@composicion': resolve(raiz, 'src/composicion'),
      '@server': resolve(raiz, 'src/server')
    }
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
