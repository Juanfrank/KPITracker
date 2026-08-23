import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@server/trpc/appRouter';

/**
 * Cliente tRPC vanilla (sin React Query — ver plan Fase 4 §9.1: se prefirió
 * un shim sobre `invocar()` para no tocar los 117 call-sites existentes,
 * todos con `useState`/`useEffect` manuales). `credentials: 'include'` es
 * lo que hace viajar la cookie de sesión firmada en cada request — sin
 * esto, `ctx.usuario` siempre sería `null` del lado del servidor.
 *
 * `AppRouter` se importa con `import type`: se borra por completo en el
 * build (Vite/esbuild elide los `import type`), así que el bundle del
 * renderer nunca arrastra código de `src/server/` — solo la forma del tipo,
 * en tiempo de compilación.
 */
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      fetch: (input, init) => fetch(input, { ...init, credentials: 'include' })
    })
  ]
});
