// Fusión de dos copias de los datos (celular ↔ PC). La usan el navegador y la función de Netlify.
// Regla: por cada id gana la versión editada más recientemente (updatedAt).
// Un borrado (tombstone) gana si es más reciente que la última edición.
import type { ErrorRegistrado, Simulacro } from "./domain";

export interface DB {
  version: 1;
  simulacros: Simulacro[];
  errores: ErrorRegistrado[];
  /** id → momento en que se borró (epoch ms) */
  borrados?: Record<string, number>;
}

const ver = (x: { updatedAt?: number; creadoEn?: number; timestamp?: number }) =>
  x.updatedAt ?? x.creadoEn ?? x.timestamp ?? 0;

function mergeList<T extends { id: string; updatedAt?: number }>(
  a: T[],
  b: T[],
  borrados: Record<string, number>,
): T[] {
  const map = new Map<string, T>();
  for (const it of [...a, ...b]) {
    if (!it || typeof it.id !== "string") continue;
    const prev = map.get(it.id);
    if (!prev || ver(it) > ver(prev)) map.set(it.id, it);
  }
  return [...map.values()].filter((it) => !(borrados[it.id] && borrados[it.id] >= ver(it)));
}

const TRES_MESES = 1000 * 60 * 60 * 24 * 90;

export function mergeDB(a: Partial<DB> | null | undefined, b: Partial<DB> | null | undefined): DB {
  const borrados: Record<string, number> = {};
  for (const src of [a?.borrados, b?.borrados]) {
    if (!src) continue;
    for (const [id, t] of Object.entries(src)) if (!borrados[id] || t > borrados[id]) borrados[id] = t;
  }
  const simulacros = mergeList(a?.simulacros ?? [], b?.simulacros ?? [], borrados).sort(
    (x, y) => y.creadoEn - x.creadoEn,
  );
  const vivos = new Set(simulacros.map((s) => s.id));
  const errores = mergeList(a?.errores ?? [], b?.errores ?? [], borrados)
    .filter((e) => vivos.has(e.simulacroId))
    .sort((x, y) => y.timestamp - x.timestamp);
  // Olvida marcas de borrado muy viejas para que el archivo no crezca sin fin
  const limite = Date.now() - TRES_MESES;
  for (const [id, t] of Object.entries(borrados)) if (t < limite) delete borrados[id];
  return { version: 1, simulacros, errores, borrados };
}

/** Huella barata para saber si dos copias son iguales. */
export function huella(db: DB) {
  const porId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1));
  const b = Object.entries(db.borrados ?? {}).sort();
  return JSON.stringify([porId(db.simulacros), porId(db.errores), b]);
}
