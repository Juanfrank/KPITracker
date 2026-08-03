import type { TypeDescriptor } from './TypeDescriptor';

/**
 * Registro extensible de tipos de dato (Open/Closed): los módulos consumen
 * descriptores por nombre y nunca hacen switch sobre tipos concretos.
 */
export class TypeRegistry {
  private readonly descriptores = new Map<string, TypeDescriptor>();

  registrar(descriptor: TypeDescriptor): void {
    if (this.descriptores.has(descriptor.tipo)) {
      throw new Error(`El tipo de dato "${descriptor.tipo}" ya está registrado.`);
    }
    this.descriptores.set(descriptor.tipo, descriptor);
  }

  obtener(tipo: string): TypeDescriptor {
    const d = this.descriptores.get(tipo);
    if (!d) throw new Error(`Tipo de dato no registrado: "${tipo}".`);
    return d;
  }

  existe(tipo: string): boolean {
    return this.descriptores.has(tipo);
  }

  listar(): TypeDescriptor[] {
    return [...this.descriptores.values()];
  }
}
