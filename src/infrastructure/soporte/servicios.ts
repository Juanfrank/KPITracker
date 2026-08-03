import { randomUUID } from 'node:crypto';
import type { IClock, IIdGenerator } from '@application/ports/index';

export class RelojSistema implements IClock {
  hoyIso(): string {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  }

  ahoraIso(): string {
    return new Date().toISOString();
  }
}

export class GeneradorUuid implements IIdGenerator {
  nuevoId(): string {
    return randomUUID();
  }
}
