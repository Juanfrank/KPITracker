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
const alias = {
  '@domain': resolve(__dirname, 'src/domain'),
  '@application': resolve(__dirname, 'src/application'),
  '@infrastructure': resolve(__dirname, 'src/infrastructure'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer')
};

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: { alias },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false }
    }
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true
  }
});
