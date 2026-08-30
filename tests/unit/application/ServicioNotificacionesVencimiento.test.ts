import { describe, expect, it } from 'vitest';
import type { IClock, INotificadorEmail, CorreoAEnviar, IUsuarioRepository } from '@application/ports/index';
import type { Usuario } from '@domain/index';
import type { FilaTablero } from '@application/use-cases/ServicioSeguimiento';
import { ServicioNotificacionesVencimiento } from '@application/notificaciones/ServicioNotificacionesVencimiento';
import type { FuenteTablero } from '@application/notificaciones/ServicioNotificacionesVencimiento';

function fila(parcial: Partial<FilaTablero> = {}): FilaTablero {
  return {
    indicadorId: 'i1', codigo: 'IND-1', nombre: 'Indicador 1', estado: 'Pendiente', periodicidad: 'Mensual' as FilaTablero['periodicidad'],
    periodoPendiente: null, fechaLimite: null, fechaCorte: null, ultimaActualizacion: null,
    responsableId: null, responsable: null, categoriaId: null, categoria: null, equipoId: null, equipo: null,
    totalPeriodos: 1, periodosCompletos: 0, atributosFiltro: [],
    ...parcial
  };
}

function usuario(parcial: Partial<Usuario> = {}): Usuario {
  return {
    id: 'u1', nombreUsuario: 'user1', nombreCompleto: 'Usuario Uno', correo: 'user1@example.com', passwordHash: 'x',
    esAdministrador: false, rolGeneralId: null, equipoId: null, rolEquipoId: null, rolGlobalId: null,
    workspaceActualId: 'ws-default', activo: true, eliminado: false, creadoEn: '2026-01-01', actualizadoEn: '2026-01-01',
    ...parcial
  };
}

class TableroFalso implements FuenteTablero {
  constructor(private readonly filas: FilaTablero[]) {}
  async tablero(): Promise<FilaTablero[]> { return this.filas; }
}

class UsuariosFalsos implements Partial<IUsuarioRepository> {
  constructor(private readonly usuarios: Map<string, Usuario>) {}
  async obtener(id: string): Promise<Usuario | null> { return this.usuarios.get(id) ?? null; }
}

class NotificadorEnMemoria implements INotificadorEmail {
  enviados: CorreoAEnviar[] = [];
  async enviar(correo: CorreoAEnviar): Promise<void> { this.enviados.push(correo); }
}

function reloj(hoy: string): IClock {
  return { hoyIso: () => hoy, ahoraIso: () => `${hoy}T00:00:00.000Z` };
}

describe('ServicioNotificacionesVencimiento', () => {
  it('envía un correo al responsable puntual de un indicador vencido, con su correo', async () => {
    const tablero = new TableroFalso([fila({ indicadorId: 'i1', estado: 'Vencido', responsableId: 'u1' })]);
    const usuarios = new UsuariosFalsos(new Map([['u1', usuario()]])) as unknown as IUsuarioRepository;
    const notificador = new NotificadorEnMemoria();

    const servicio = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-15'));
    const resultado = await servicio.ejecutar();

    expect(resultado).toEqual({ enviadas: 1, omitidas: 0 });
    expect(notificador.enviados).toHaveLength(1);
    expect(notificador.enviados[0]?.para).toBe('user1@example.com');
    expect(notificador.enviados[0]?.asunto).toContain('vencido');
    expect(notificador.enviados[0]?.textoPlano).toContain('Indicador 1');
  });

  it('omite (no envía) un indicador sin responsable puntual', async () => {
    const tablero = new TableroFalso([fila({ indicadorId: 'i1', estado: 'Vencido', responsableId: null })]);
    const usuarios = new UsuariosFalsos(new Map()) as unknown as IUsuarioRepository;
    const notificador = new NotificadorEnMemoria();

    const servicio = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-15'));
    const resultado = await servicio.ejecutar();

    expect(resultado).toEqual({ enviadas: 0, omitidas: 1 });
    expect(notificador.enviados).toHaveLength(0);
  });

  it('omite un indicador cuyo responsable no tiene correo cargado', async () => {
    const tablero = new TableroFalso([fila({ indicadorId: 'i1', estado: 'Vencido', responsableId: 'u1' })]);
    const usuarios = new UsuariosFalsos(new Map([['u1', usuario({ correo: null })]])) as unknown as IUsuarioRepository;
    const notificador = new NotificadorEnMemoria();

    const servicio = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-15'));
    const resultado = await servicio.ejecutar();

    expect(resultado).toEqual({ enviadas: 0, omitidas: 1 });
  });

  it('no reenvía el mismo aviso dos veces el mismo día (deduplicación en memoria)', async () => {
    const tablero = new TableroFalso([fila({ indicadorId: 'i1', estado: 'Vencido', responsableId: 'u1' })]);
    const usuarios = new UsuariosFalsos(new Map([['u1', usuario()]])) as unknown as IUsuarioRepository;
    const notificador = new NotificadorEnMemoria();

    const servicio = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-15'));
    await servicio.ejecutar();
    const segunda = await servicio.ejecutar();

    expect(segunda).toEqual({ enviadas: 0, omitidas: 1 });
    expect(notificador.enviados).toHaveLength(1); // no un segundo correo
  });

  it('vuelve a notificar al día siguiente si el indicador sigue vencido', async () => {
    const tablero = new TableroFalso([fila({ indicadorId: 'i1', estado: 'Vencido', responsableId: 'u1' })]);
    const usuarios = new UsuariosFalsos(new Map([['u1', usuario()]])) as unknown as IUsuarioRepository;
    const notificador = new NotificadorEnMemoria();

    const servicio1 = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-15'));
    await servicio1.ejecutar();
    const servicio2 = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-16'));
    const segunda = await servicio2.ejecutar();

    // Dos instancias distintas (cada corrida real del job crea una nueva) — el dedup por día
    // no cruza instancias, ver docstring "en memoria, no sobrevive un reinicio".
    expect(segunda.enviadas).toBe(1);
    expect(notificador.enviados).toHaveLength(2);
  });

  it('distingue Vencido de ProximoAVencer como avisos separados para el mismo indicador', async () => {
    // Un indicador Pendiente con fecha próxima genera "ProximoAVencer"; no se confunde con "Vencido".
    const tablero = new TableroFalso([
      fila({ indicadorId: 'i1', estado: 'Pendiente', fechaLimite: '2026-06-17', responsableId: 'u1' })
    ]);
    const usuarios = new UsuariosFalsos(new Map([['u1', usuario()]])) as unknown as IUsuarioRepository;
    const notificador = new NotificadorEnMemoria();

    const servicio = new ServicioNotificacionesVencimiento(tablero, usuarios, notificador, reloj('2026-06-15'), 3);
    await servicio.ejecutar();

    expect(notificador.enviados).toHaveLength(1);
    expect(notificador.enviados[0]?.asunto).toContain('próximo a vencer');
  });
});
