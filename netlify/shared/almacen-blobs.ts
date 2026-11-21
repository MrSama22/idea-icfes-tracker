import { getStore } from "@netlify/blobs";
import type { Almacen } from "./almacen.ts";

/** Todas las cuentas, sesiones y cartillas viven en un solo store de Netlify Blobs. */
export function almacenBlobs(nombre = "idea"): Almacen {
  const blobs = getStore({ name: nombre, consistency: "strong" });
  return {
    get: async <T>(clave: string) => ((await blobs.get(clave, { type: "json" })) as T | null) ?? null,
    set: async (clave, valor) => {
      await blobs.setJSON(clave, valor as Record<string, unknown>);
    },
    del: async (clave) => {
      await blobs.delete(clave);
    },
    claves: async (prefijo) => (await blobs.list({ prefix: prefijo })).blobs.map((b) => b.key),
  };
}
