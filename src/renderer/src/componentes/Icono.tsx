/** Iconos de línea, sin dependencias externas (paths de 24x24). */
const RUTAS: Record<string, string> = {
  tablero: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  indicador: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  atributo: 'M4 6h16M4 12h10M4 18h7',
  regla: 'M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0',
  lista: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  captura: 'M3 5h18v14H3zM3 10h18M9 5v14',
  reloj: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0',
  exportar: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  auditoria: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  ajustes:
    'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1l2-1.6-2-3.4-2.4 1a7.4 7.4 0 00-1.7-1L14.8 3h-4l-.4 2.6a7.4 7.4 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 001.7 1l.4 2.4h4l.4-2.4a7.4 7.4 0 001.7-1l2.4 1 2-3.4-2-1.6c.06-.33.1-.66.1-1z',
  admin: 'M12 3a4 4 0 110 8 4 4 0 010-8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  sol: 'M12 17a5 5 0 100-10 5 5 0 000 10zm0-15v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4m0-14.2l-1.4 1.4M6.3 17.7l-1.4 1.4',
  luna: 'M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z',
  buscar: 'M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4.35-4.35',
  mas: 'M12 5v14M5 12h14',
  cerrar: 'M6 6l12 12M18 6L6 18',
  flecha: 'M9 6l6 6-6 6',
  subir: 'M12 20V6m0 0l-5 5m5-5l5 5M4 20h16',
  historial: 'M3 12a9 9 0 109-9M3 12h5m-5 0V7M12 7v5l3 3',
  adjunto: 'M17 7l-8.5 8.5a3 3 0 004.24 4.24L21 11.5a5 5 0 00-7.07-7.07L6 11.5',
  informacion: 'M12 16v-4m0-4h.01M12 21a9 9 0 100-18 9 9 0 000 18z'
};

export function Icono({ nombre, tamano = 17 }: { nombre: string; tamano?: number }): React.JSX.Element {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={RUTAS[nombre] ?? ''} />
    </svg>
  );
}
