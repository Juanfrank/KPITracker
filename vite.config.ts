import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Build standalone de la SPA (Fase 4 — reemplaza el bloque "renderer" de
 * `electron.vite.config.ts`, que sigue existiendo hasta que se retire
 * Electron por completo, ver plan §9.8/§9.10). `root` apunta a
 * `src/renderer` (donde vive `index.html`); el resultado se sirve estático
 * desde Express (`src/server/app.ts`) — mismo `outDir` que ya usaba
 * `electron-vite` para no romper convenciones existentes.
 *
 * `server.proxy` reenvía `/api/*` al servidor Express en dev — evita CORS
 * por completo (en producción ambos ya comparten origen, porque Express
 * sirve el bundle) y hace que la cookie de sesión viaje igual en los dos
 * entornos.
 */
// `import.meta.dirname` (no `__dirname`, este archivo es ESM) — Vite 8 avisa
// que el `configLoader: 'native'` que será default más adelante no soporta
// `__dirname` en el config.
const raiz = import.meta.dirname;

const alias = {
  '@domain': resolve(raiz, 'src/domain'),
  '@application': resolve(raiz, 'src/application'),
  '@infrastructure': resolve(raiz, 'src/infrastructure'),
  '@shared': resolve(raiz, 'src/shared'),
  '@renderer': resolve(raiz, 'src/renderer')
};

export default defineConfig({
  root: resolve(raiz, 'src/renderer'),
  plugins: [react()],
  resolve: { alias },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false }
    }
  },
  build: {
    outDir: resolve(raiz, 'out/renderer'),
    emptyOutDir: true
  }
});
