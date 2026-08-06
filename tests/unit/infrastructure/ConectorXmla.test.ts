import { describe, expect, it } from 'vitest';
import { normalizarEndpointXmla, motivoEndpointNoSoportado } from '@infrastructure/conectores/ConectorXmla';

/**
 * `powerbi://api.powerbi.com/v1.0/myorg/<workspace>` es la convención que
 * usan las herramientas de Microsoft (SSMS, DAX Studio, Tabular Editor)
 * para el endpoint XMLA de Power BI Premium/PPU/Fabric. Sin traducirla a
 * `https://`, `new URL('powerbi://...')` parsea sin lanzar pero con
 * `protocol !== 'https:'`, y el cliente SOAP crudo caía al branch HTTP
 * plano (puerto 80) — que Power BI no atiende, así que la conexión fallaba
 * en silencio con un error de transporte genérico.
 */
describe('normalizarEndpointXmla', () => {
  it('traduce powerbi:// a https:// conservando host y ruta', () => {
    expect(normalizarEndpointXmla('powerbi://api.powerbi.com/v1.0/myorg/MiWorkspace')).toBe(
      'https://api.powerbi.com/v1.0/myorg/MiWorkspace'
    );
  });

  it('es insensible a mayúsculas en el esquema', () => {
    expect(normalizarEndpointXmla('PowerBI://api.powerbi.com/v1.0/myorg/W')).toBe('https://api.powerbi.com/v1.0/myorg/W');
  });

  it('deja intactas las URL que ya son https://', () => {
    const url = 'https://api.powerbi.com/v1.0/myorg/MiWorkspace';
    expect(normalizarEndpointXmla(url)).toBe(url);
  });

  it('deja intactas las URL de Azure Analysis Services u otros servidores XMLA genéricos', () => {
    const url = 'https://miservidor.asazure.windows.net/servers/miservidor';
    expect(normalizarEndpointXmla(url)).toBe(url);
  });

  it('deja intacta una cadena vacía', () => {
    expect(normalizarEndpointXmla('')).toBe('');
  });
});

/**
 * Power BI Premium/Fabric y Azure Analysis Services publican una URL con
 * forma de "endpoint XMLA", pero solo son alcanzables por el proveedor
 * propietario MSOLAP — nunca por un POST SOAP crudo (ver el docstring de la
 * clase ConectorXmla). Esta función falla explícito e inmediato en vez de
 * dejar que la petición viaje y vuelva con un HTTP 404 críptico.
 */
describe('motivoEndpointNoSoportado', () => {
  it('detecta powerbi:// y sugiere el tipo de origen "PowerBI"', () => {
    const motivo = motivoEndpointNoSoportado('powerbi://api.powerbi.com/v1.0/myorg/MiWorkspace');
    expect(motivo).toContain('tipo "PowerBI"');
  });

  it('detecta https://api.powerbi.com/... igual que powerbi://', () => {
    const motivo = motivoEndpointNoSoportado('https://api.powerbi.com/v1.0/myorg/MiWorkspace');
    expect(motivo).toContain('tipo "PowerBI"');
  });

  it('detecta *.asazure.windows.net (Azure Analysis Services)', () => {
    const motivo = motivoEndpointNoSoportado('https://miservidor.asazure.windows.net/servers/miservidor');
    expect(motivo).toContain('Azure Analysis Services');
  });

  it('deja pasar un endpoint XMLA-sobre-HTTP genuino (SSAS on-premise, msmdpump.dll)', () => {
    expect(motivoEndpointNoSoportado('https://ssas.miorganizacion.local/OLAP/msmdpump.dll')).toBeNull();
  });

  it('deja pasar una cadena vacía (el mensaje de "falta la URL" lo maneja otro punto del código)', () => {
    expect(motivoEndpointNoSoportado('')).toBeNull();
  });
});
