// Almacenamiento clave → valor. En producción es Netlify Blobs; en desarrollo, memoria.
export interface Almacen {
  get<T = unknown>(clave: string): Promise<T | null>;
  set(clave: string, valor: unknown): Promise<void>;
  del(clave: string): Promise<void>;
  claves(prefijo: string): Promise<string[]>;
}

/** Versión en memoria: solo para `bun run dev`. Se pierde al reiniciar el servidor. */
export function almacenMemoria(): Almacen {
  const m = new Map<string, unknown>();
  return {
    async get<T>(clave: string) {
      return m.has(clave) ? (m.get(clave) as T) : null;
    },
    async set(clave, valor) {
      m.set(clave, valor);
    },
    async del(clave) {
      m.delete(clave);
    },
    async claves(prefijo) {
      return [...m.keys()].filter((k) => k.startsWith(prefijo));
    },
  };
}
