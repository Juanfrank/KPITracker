import type { IConectorOrigen, ResultadoPrueba, ResultadoTabular } from '@application/ports/index';
import type { OrigenAutomatico } from '@domain/index';
import { ConectorApi } from './ConectorApi';
import { ConectorSql } from './ConectorSql';
import { ConectorXmla } from './ConectorXmla';
import type { GuardarOrigen } from '../auth/AutenticadorMicrosoft';

/** Despacha al conector concreto (API/SQL/XMLA) según el tipo del origen. */
export class ConectorOrigenFactory implements IConectorOrigen {
  private readonly api = new ConectorApi();
  private readonly sqlServer = new ConectorSql();
  private readonly xmla: ConectorXmla;

  /**
   * `guardarOrigen` persiste de vuelta el origen (usado por XMLA con
   * autenticación Microsoft interactiva, para guardar el refresh token
   * cifrado tras un login exitoso y no pedirlo de nuevo en cada sesión).
   */
  constructor(guardarOrigen?: GuardarOrigen) {
    this.xmla = new ConectorXmla(guardarOrigen);
  }

  private conectorPara(tipo: OrigenAutomatico['tipo']): Pick<IConectorOrigen, 'probar' | 'ejecutar'> {
    switch (tipo) {
      case 'API':
        return this.api;
      case 'SQL':
        return this.sqlServer;
      case 'XMLA':
        return this.xmla;
    }
  }

  probar(origen: OrigenAutomatico): Promise<ResultadoPrueba> {
    return this.conectorPara(origen.tipo).probar(origen);
  }

  ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular> {
    return this.conectorPara(origen.tipo).ejecutar(origen, script);
  }
}
