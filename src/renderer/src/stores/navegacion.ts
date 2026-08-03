import { create } from 'zustand';

interface EstadoNavegacion {
  moduloActual: string;
  /** Parámetros de contexto entre módulos (p. ej. indicador preseleccionado). */
  parametros: Record<string, string>;
  navegar(modulo: string, parametros?: Record<string, string>): void;
}

/** ViewModel global de navegación (MVVM: la vista solo lee y despacha). */
export const useNavegacion = create<EstadoNavegacion>((set) => ({
  moduloActual: 'seguimiento',
  parametros: {},
  navegar: (modulo, parametros = {}) => set({ moduloActual: modulo, parametros })
}));
