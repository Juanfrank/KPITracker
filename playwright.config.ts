import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/acceptance',
  // Construye la SPA una sola vez antes de la suite — cada spec levanta su
  // propio servidor Express que la sirve (ver tests/acceptance/fixtures.ts).
  globalSetup: './tests/acceptance/globalSetup.ts',
  timeout: 120000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure'
  }
});
