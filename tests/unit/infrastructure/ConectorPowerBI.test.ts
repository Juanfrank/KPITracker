import { describe, expect, it } from 'vitest';
import { autenticacionEfectivaPowerBI } from '@infrastructure/conectores/ConectorPowerBI';

/**
 * La API REST de Power BI nunca admite Basic ni "sin autenticación" — a
 * diferencia de XMLA, "sin configurar" no puede caer a Basic. Antes de este
 * fix, un origen PowerBI recién creado (sin `autenticacion` explícito)
 * intentaba la petición sin credenciales y fallaba con "Configure
 * autenticación..." aunque la UI mostrara "Microsoft" seleccionado.
 */
describe('autenticacionEfectivaPowerBI', () => {
  it('sin autenticación configurada, asume Microsoft', () => {
    expect(autenticacionEfectivaPowerBI({}).autenticacion).toBe('microsoft');
  });

  it('con autenticacion="oauth2", la respeta y conserva el resto de la configuración', () => {
    const resultado = autenticacionEfectivaPowerBI({ autenticacion: 'oauth2', tokenUrl: 'https://x', clienteId: 'a' });
    expect(resultado.autenticacion).toBe('oauth2');
    expect(resultado.tokenUrl).toBe('https://x');
    expect(resultado.clienteId).toBe('a');
  });

  it('con autenticacion="basic" (nunca ofrecido por la UI para PowerBI, pero posible en datos legados), fuerza Microsoft', () => {
    expect(autenticacionEfectivaPowerBI({ autenticacion: 'basic', usuario: 'x' }).autenticacion).toBe('microsoft');
  });

  it('con autenticacion="microsoft" explícito, la conserva y conserva el resto de la configuración', () => {
    const resultado = autenticacionEfectivaPowerBI({ autenticacion: 'microsoft', clienteId: 'cid', tenantId: 'tid' });
    expect(resultado).toEqual({ autenticacion: 'microsoft', clienteId: 'cid', tenantId: 'tid' });
  });
});
