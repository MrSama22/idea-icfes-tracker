// Banco de preguntas oficiales (cuadernillos ICFES) + generador de simulacros + estadísticas por tema.
import { useEffect, useState } from "react";
import { MATERIAS, qkey, type MateriaId, type Practica, type PracticaItem } from "./domain";

export interface Figura {
  f: string;
  w?: number;
  h?: number;
  alt: string;
}
export interface Opcion {
  l: string;
  t: string;
  figuras: Figura[];
}
export interface Pregunta {
  n: number;
  enunciado: string;
  figuras: Figura[];
  opciones: Opcion[];
  clave: string;
  afirmacion: string | null;
  nivel: string | null;
  tema: string;
  subtema: string;
  resumen: string;
  explicacion: string;
  porque: Record<string, string>;
  trampa: string;
  mejorar: string;
  estrategia: string;
  dificultad: number;
  seg: number;
}
export interface Unidad {
  id: string;
  materia: MateriaId;
  examen: number | null;
  contexto: string;
  contextoFiguras: Figura[];
  segCtx: number;
  preguntas: Pregunta[];
}
export interface Tema {
  id: string;
  nombre: string;
  desc: string;
}
export interface Leccion {
  gancho: string;
  idea_clave: string;
  pasos: { titulo: string; texto: string }[];
  ejemplo: { enunciado: string; opciones: Record<string, string>; correcta: string; solucion: string };
  errores: { error: string; como_evitarlo: string }[];
  practica: { enunciado: string; opciones: Record<string, string>; correcta: string; explicacion: string }[];
  recordar: string[];
}
export interface Banco {
  v: number;
  temas: Record<MateriaId, Tema[]>;
  lecciones: Record<string, Leccion>;
  unidades: Unidad[];
  // índices
  porId: Map<string, Unidad>;
  temaPorId: Map<string, Tema & { materia: MateriaId }>;
}

let promesa: Promise<Banco> | null = null;
let cache: Banco | null = null;

export function cargarBanco(): Promise<Banco> {
  if (!promesa) {
    promesa = fetch("/banco/banco.json")
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar el banco de preguntas");
        return r.json();
      })
      .then((b: Banco) => {
        b.porId = new Map(b.unidades.map((u) => [u.id, u]));
        b.temaPorId = new Map();
        for (const [m, ts] of Object.entries(b.temas)) for (const t of ts) b.temaPorId.set(t.id, { ...t, materia: m as MateriaId });
        cache = b;
        return b;
      })
      .catch((e) => {
        promesa = null;
        throw e;
      });
  }
  return promesa;
}

export function useBanco() {
  const [b, setB] = useState<Banco | null>(cache);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (b) return;
    let vivo = true;
    cargarBanco()
      .then((x) => vivo && setB(x))
      .catch((e) => vivo && setError(String(e.message ?? e)));
    return () => {
      vivo = false;
    };
  }, [b]);
  return { banco: b, error };
}

export const img = (f: string) => `/banco/img/${f}.webp`;
export const ilus = (temaId: string) => `/banco/ilus/${temaId}.webp`;

/** Etiqueta del cuadernillo de origen. */
export function origen(u: Unidad) {
  const m = MATERIAS.find((x) => x.id === u.materia)!;
  return u.materia === "ING" ? `${m.nombre} · examen ${u.examen}` : m.nombre;
}

export const costo = (u: Unidad, qs: number[] = u.preguntas.map((p) => p.n)) =>
  u.segCtx + u.preguntas.filter((p) => qs.includes(p.n)).reduce((a, p) => a + p.seg, 0);

// --- Azar con semilla (para que la vista previa y el simulacro creado coincidan) ---
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function barajar<T>(xs: T[], r: () => number) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Plan {
  items: PracticaItem[];
  porMateria: Record<string, number>;
  preguntas: number;
  segundos: number;
  todo: boolean; // se usó todo el banco de esas materias
}

/**
 * Llena el tiempo con preguntas al azar. Nunca separa un grupo sin mostrar su texto:
 * los grupos van completos y, solo si sobra tiempo al final, se toma parte de un grupo (con su texto completo).
 * `vistas`: preguntas ya respondidas antes (salen al final de la fila).
 */
export function planear(b: Banco, materias: MateriaId[], segundos: number, seed: number, vistas: Set<string> = new Set()): Plan {
  const r = rng(seed);
  const orden = MATERIAS.map((m) => m.id).filter((m) => materias.includes(m));
  const pools = new Map<MateriaId, Unidad[]>();
  for (const m of orden) {
    const us = barajar(b.unidades.filter((u) => u.materia === m), r);
    const nuevas = (u: Unidad) => u.preguntas.some((p) => !vistas.has(qkey(u.id, p.n)));
    pools.set(m, [...us.filter(nuevas), ...us.filter((u) => !nuevas(u))]);
  }
  const tam = (m: MateriaId) => b.unidades.filter((u) => u.materia === m).reduce((a, u) => a + u.preguntas.length, 0);
  const totalTam = orden.reduce((a, m) => a + tam(m), 0);
  const elegidas = new Map<MateriaId, PracticaItem[]>(orden.map((m) => [m, []]));
  const usadas = new Set<string>();
  let sobra = 0;
  // 1) Cada materia recibe una parte del tiempo proporcional a su tamaño; lo que sobra pasa a la siguiente.
  for (const m of orden) {
    let rest = (segundos * tam(m)) / totalTam + sobra;
    for (const u of pools.get(m)!) {
      const c = costo(u);
      if (c <= rest) {
        elegidas.get(m)!.push({ u: u.id, qs: u.preguntas.map((p) => p.n) });
        usadas.add(u.id);
        rest -= c;
      }
    }
    sobra = rest;
  }
  // 2) Con el tiempo que quede, completa con unidades enteras de cualquier materia y luego con parte de un grupo.
  for (const m of orden) {
    for (const u of pools.get(m)!) {
      if (usadas.has(u.id)) continue;
      const c = costo(u);
      if (c <= sobra) {
        elegidas.get(m)!.push({ u: u.id, qs: u.preguntas.map((p) => p.n) });
        usadas.add(u.id);
        sobra -= c;
      }
    }
  }
  for (const m of orden) {
    for (const u of pools.get(m)!) {
      if (usadas.has(u.id) || u.preguntas.length < 2) continue;
      const qs: number[] = [];
      let c = u.segCtx;
      for (const p of u.preguntas) {
        if (c + p.seg > sobra) break;
        c += p.seg;
        qs.push(p.n);
      }
      if (qs.length) {
        elegidas.get(m)!.push({ u: u.id, qs });
        usadas.add(u.id);
        sobra -= c;
      }
    }
  }
  // Ordena: por materia (como en el examen real); dentro de cada materia, al azar.
  const items = orden.flatMap((m) => elegidas.get(m)!);
  const porMateria: Record<string, number> = {};
  for (const m of orden) porMateria[m] = elegidas.get(m)!.reduce((a, it) => a + it.qs.length, 0);
  const preguntas = items.reduce((a, it) => a + it.qs.length, 0);
  const seg = items.reduce((a, it) => a + costo(b.porId.get(it.u)!, it.qs), 0);
  return { items, porMateria, preguntas, segundos: seg, todo: preguntas === totalTam };
}

/** Lista plana de preguntas de una práctica, en orden. */
export function aplanar(b: Banco, p: Pick<Practica, "items">) {
  const out: { u: Unidad; q: Pregunta; key: string; i: number; grupo: number[] }[] = [];
  for (const it of p.items) {
    const u = b.porId.get(it.u);
    if (!u) continue;
    for (const n of it.qs) {
      const q = u.preguntas.find((x) => x.n === n);
      if (q) out.push({ u, q, key: qkey(u.id, n), i: out.length, grupo: it.qs });
    }
  }
  return out;
}

// --- Estadísticas por tema a partir de todo lo respondido ---
export interface TemaStat {
  tema: Tema & { materia: MateriaId };
  vistas: number;
  bien: number;
  mal: number;
  ultimaMal: number; // epoch
  fallos: string[]; // claves de preguntas falladas (la última vez)
}

export function statsTemas(b: Banco, practicas: Practica[]) {
  const ultima = new Map<string, { ok: boolean; t: number }>();
  const orden = [...practicas].sort((a, c) => a.creadoEn - c.creadoEn);
  for (const p of orden) {
    const revelado = p.finalizado || p.modo === "practica";
    if (!revelado) continue;
    for (const it of p.items) {
      const u = b.porId.get(it.u);
      if (!u) continue;
      for (const n of it.qs) {
        const k = qkey(u.id, n);
        const r = p.respuestas[k];
        if (!r && p.modo === "practica") continue; // en práctica, solo cuenta lo que contestó
        const q = u.preguntas.find((x) => x.n === n)!;
        if (!r && !p.finalizado) continue;
        ultima.set(k, { ok: r === q.clave, t: p.updatedAt ?? p.creadoEn });
      }
    }
  }
  const stats = new Map<string, TemaStat>();
  for (const t of b.temaPorId.values()) stats.set(t.id, { tema: t, vistas: 0, bien: 0, mal: 0, ultimaMal: 0, fallos: [] });
  for (const [k, v] of ultima) {
    const [uid, n] = [k.slice(0, k.lastIndexOf(":")), Number(k.slice(k.lastIndexOf(":") + 1))];
    const q = b.porId.get(uid)?.preguntas.find((x) => x.n === n);
    const s = q && stats.get(q.tema);
    if (!s) continue;
    s.vistas++;
    if (v.ok) s.bien++;
    else {
      s.mal++;
      s.fallos.push(k);
      s.ultimaMal = Math.max(s.ultimaMal, v.t);
    }
  }
  return stats;
}

/** Más difíciles primero: más fallos relativos (con un pequeño suavizado para pocos datos). */
export function ordenarPorDificultad(stats: TemaStat[]) {
  const score = (s: TemaStat) => (s.vistas ? (s.mal + 0.5) / (s.vistas + 1) : -1);
  return [...stats].sort((a, c) => score(c) - score(a) || c.mal - a.mal);
}

export function preguntasDeTema(b: Banco, temaId: string) {
  const out: PracticaItem[] = [];
  for (const u of b.unidades) {
    const qs = u.preguntas.filter((p) => p.tema === temaId).map((p) => p.n);
    if (qs.length) out.push({ u: u.id, qs });
  }
  return out;
}

export function itemsDesdeClaves(keys: string[]) {
  const m = new Map<string, number[]>();
  for (const k of keys) {
    const i = k.lastIndexOf(":");
    const u = k.slice(0, i);
    m.set(u, [...(m.get(u) ?? []), Number(k.slice(i + 1))]);
  }
  return [...m].map(([u, qs]) => ({ u, qs: qs.sort((a, b) => a - b) }));
}

export function mezclar<T>(xs: T[], seed = Date.now()) {
  return barajar(xs, rng(seed));
}

export const fmtDur = (seg: number) => {
  const m = Math.round(seg / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
