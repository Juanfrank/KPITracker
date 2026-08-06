import { describe, expect, it } from 'vitest';
import { normalizarEndpointXmla } from '@infrastructure/conectores/ConectorXmla';

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
