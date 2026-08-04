import { describe, expect, it } from 'vitest';
import { indicadoresQueRequierenNotificacion } from '@application/notificaciones/DetectorVencimientos';
import type { FilaTablero } from '@application/use-cases/ServicioSeguimiento';

function fila(parcial: Partial<FilaTablero> = {}): FilaTablero {
  return {
    indicadorId: 'i1', nombre: 'Indicador 1', estado: 'Pendiente', periodicidad: 'Mensual' as FilaTablero['periodicidad'],
    periodoPendiente: null, fechaLimite: null, fechaCorte: null, ultimaActualizacion: null,
    responsableId: null, responsable: null, categoriaId: null, categoria: null,
    totalPeriodos: 1, periodosCompletos: 0,
    ...parcial
  };
}

describe('indicadoresQueRequierenNotificacion', () => {
  it('incluye indicadores vencidos', () => {
    const resultado = indicadoresQueRequierenNotificacion([fila({ estado: 'Vencido' })], '2025-06-15');
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.motivo).toBe('Vencido');
  });

  it('incluye pendientes con fecha límite dentro de la ventana de anticipación', () => {
    const resultado = indicadoresQueRequierenNotificacion(
      [fila({ estado: 'Pendiente', fechaLimite: '2025-06-17' })],
      '2025-06-15',
      3
    );
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.motivo).toBe('ProximoAVencer');
  });

  it('excluye pendientes con fecha límite lejana', () => {
    const resultado = indicadoresQueRequierenNotificacion(
      [fila({ estado: 'Pendiente', fechaLimite: '2025-07-30' })],
      '2025-06-15',
      3
    );
    expect(resultado).toHaveLength(0);
  });

  it('excluye completados y no aplica aunque tengan fecha límite próxima', () => {
    const resultado = indicadoresQueRequierenNotificacion(
      [fila({ estado: 'Completo', fechaLimite: '2025-06-16' }), fila({ estado: 'NoAplica', fechaLimite: '2025-06-16' })],
      '2025-06-15'
    );
    expect(resultado).toHaveLength(0);
  });

  it('excluye pendientes sin fecha límite fijada', () => {
    const resultado = indicadoresQueRequierenNotificacion([fila({ estado: 'Pendiente', fechaLimite: null })], '2025-06-15');
    expect(resultado).toHaveLength(0);
  });
});
