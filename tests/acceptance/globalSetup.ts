import { execSync } from 'node:child_process';

/**
 * Construye la SPA una sola vez antes de correr toda la suite de
 * aceptación (cada spec levanta su propio servidor Express — ver
 * `fixtures.ts` — que sirve este mismo build estático). Reemplaza el
 * `npm run build && playwright test` del `package.json` de antes de la
 * Fase 4 (que compilaba Electron).
 */
export default function globalSetup(): void {
  execSync('npm run build', { stdio: 'inherit' });
}
