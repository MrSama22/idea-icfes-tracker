// Cartillas subidas por el estudiante (PDF o fotos) → preguntas nuevas para el banco.
// 1) Se dibuja cada página en el navegador. 2) La IA transcribe las preguntas página por página.
// 3) Se recortan las figuras. 4) La IA explica cada pregunta (y la resuelve si la cartilla no trae clave).
// Todo queda en el dispositivo (IndexedDB) y, si hay código de sincronización, también en la nube.
import { useSyncExternalStore } from "react";
import { idb } from "./idb";
import { sync } from "./sync";
import { MATERIAS, type MateriaId } from "./domain";
import type { Figura, Pregunta, Unidad } from "./banco";

export type Fase = "leyendo" | "extrayendo" | "explicando" | "listo" | "error";
interface Paso {
  job?: string;
  estado: "pendiente" | "enviado" | "listo" | "error";
  intentos: number;
  r?: any;
}
interface Cruda {
  id: string;
  materia: MateriaId;
  contexto: string;
  contextoFiguras: Figura[];
  preguntas: { n: number; enunciado: string; figuras: Figura[]; opciones: { l: string; t: string; figuras: Figura[] }[]; clave: string | null }[];
}
export interface Cartilla {
  id: string;
  nombre: string;
  materia: MateriaId | null;
  creado: number;
  activa: boolean;
  total: number;
  fase: Fase;
  error?: string;
  paginas: Record<number, Paso>;
  crudas?: Cruda[];
  repetidas?: number;
  exp: Record<string, Paso>;
  unidades: Unidad[];
  sincronizada?: boolean;
}

const MAX_PAGINAS = 120;
const CONCURRENCIA = 4;
const RITMO = 1.35;

// ---------- estado en memoria + suscripción ----------
let lista: Cartilla[] = [];
const subs = new Set<() => void>();
const avisar = () => {
  lista = [...lista];
  subs.forEach((f) => f());
};
const guardar = async (c: Cartilla) => {
  const i = lista.findIndex((x) => x.id === c.id);
  if (i >= 0) lista[i] = c;
  else lista.unshift(c);
  avisar();
  await idb.set("cartillas", c.id, c);
};

let listoRes: () => void;
const listoP = new Promise<void>((r) => (listoRes = r));
if (typeof indexedDB !== "undefined") {
  idb
    .all<Cartilla>("cartillas")
    .then((cs) => {
      lista = cs.sort((a, b) => b.creado - a.creado);
      avisar();
    })
    .catch(() => {})
    .finally(() => {
      listoRes();
      void motor();
      void sincronizarCartillas();
    });
} else listoRes!();

export const cartillas = {
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  get: () => lista,
  listo: () => listoP,
  /** Unidades listas de las cartillas activas (se suman al banco). */
  unidades(): Unidad[] {
    return lista.filter((c) => c.fase === "listo" && c.activa).flatMap((c) => c.unidades);
  },
  async alternar(id: string) {
    const c = lista.find((x) => x.id === id);
    if (c) await guardar({ ...c, activa: !c.activa });
  },
  async renombrar(id: string, nombre: string) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    const n = { ...c, nombre, sincronizada: false };
    await guardar(n);
    void subir(n);
  },
  async eliminar(id: string) {
    lista = lista.filter((x) => x.id !== id);
    avisar();
    await idb.del("cartillas", id);
    await idb.delPrefijo("paginas", `${id}:`);
    const codigo = sync.get().codigo;
    if (codigo) await fetch(`/api/cartillas/${codigo}/${id}`, { method: "DELETE" }).catch(() => {});
  },
  async reintentar(id: string) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    const paginas = Object.fromEntries(Object.entries(c.paginas).map(([k, p]) => [k, p.estado === "error" ? { estado: "pendiente", intentos: 0 } : p])) as Cartilla["paginas"];
    const exp = Object.fromEntries(Object.entries(c.exp).map(([k, p]) => [k, p.estado === "error" ? { estado: "pendiente", intentos: 0 } : p])) as Cartilla["exp"];
    const fase: Fase = c.crudas ? "explicando" : "extrayendo";
    await guardar({ ...c, paginas, exp, fase, error: undefined });
    void motor();
  },
};

export function useCartillas() {
  return useSyncExternalStore(cartillas.subscribe, cartillas.get, cartillas.get);
}

export function progreso(c: Cartilla) {
  const ps = Object.values(c.paginas);
  const es = Object.values(c.exp);
  const hechas = (xs: Paso[]) => xs.filter((p) => p.estado === "listo" || p.estado === "error").length;
  return {
    paginas: { hechas: hechas(ps), total: c.total },
    unidades: { hechas: hechas(es), total: es.length },
    preguntas: c.fase === "listo" ? c.unidades.reduce((a, u) => a + u.preguntas.length, 0) : (c.crudas ?? []).reduce((a, u) => a + u.preguntas.length, 0),
  };
}

// ---------- 1) leer el archivo ----------
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join("");

async function aJpeg(fuente: CanvasImageSource, w: number, h: number, maxW = 1400, calidad = 0.82) {
  const s = Math.min(1, maxW / w);
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * s);
  cv.height = Math.round(h * s);
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(fuente, 0, 0, cv.width, cv.height);
  return cv.toDataURL("image/jpeg", calidad);
}

export async function subirArchivos(files: File[], nombre: string, materia: MateriaId | null, onPaso?: (txt: string) => void) {
  const id = uid();
  const c: Cartilla = {
    id,
    nombre: nombre.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "Mi cartilla",
    materia,
    creado: Date.now(),
    activa: true,
    total: 0,
    fase: "leyendo",
    paginas: {},
    exp: {},
    unidades: [],
  };
  await guardar(c);
  try {
    let n = 0;
    for (const f of files) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import("pdfjs-dist");
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        for (let i = 1; i <= doc.numPages && n < MAX_PAGINAS; i++) {
          onPaso?.(`Leyendo página ${i} de ${doc.numPages}…`);
          const page = await doc.getPage(i);
          const v1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: 1400 / v1.width });
          const cv = document.createElement("canvas");
          cv.width = Math.round(vp.width);
          cv.height = Math.round(vp.height);
          await page.render({ canvas: cv, viewport: vp }).promise;
          n++;
          await idb.set("paginas", `${id}:${n}`, await aJpeg(cv, cv.width, cv.height));
          page.cleanup();
        }
        await doc.destroy();
      } else if (f.type.startsWith("image/")) {
        onPaso?.(`Leyendo imagen ${n + 1}…`);
        const bmp = await createImageBitmap(f);
        n++;
        await idb.set("paginas", `${id}:${n}`, await aJpeg(bmp, bmp.width, bmp.height, 1600));
      }
      if (n >= MAX_PAGINAS) break;
    }
    if (!n) throw new Error("No encontramos páginas en ese archivo. Sube un PDF o fotos.");
    const paginas: Cartilla["paginas"] = {};
    for (let i = 1; i <= n; i++) paginas[i] = { estado: "pendiente", intentos: 0 };
    const listo = { ...c, total: n, paginas, fase: "extrayendo" as Fase };
    await guardar(listo);
    void motor();
    return listo;
  } catch (e) {
    await guardar({ ...c, fase: "error", error: String((e as Error).message ?? e) });
    throw e;
  }
}

// ---------- trabajos en el servidor ----------
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
class Pausa extends Error {}

async function trabajo(paso: Paso, jobId: string, cuerpo: () => Promise<unknown>, alGuardar: (p: Paso) => Promise<void>): Promise<Paso> {
  let p = { ...paso };
  if (p.estado === "pendiente" || !p.job) {
    const job = `${jobId}-${p.intentos}`;
    const body = JSON.stringify(await cuerpo());
    let res: Response | null = null;
    for (let k = 0; k < 40 && !res; k++) {
      res = await fetch(`/api/ia/${job}`, { method: "POST", headers: { "content-type": "application/json" }, body }).catch(() => null);
      if (!res) await espera(15_000); // sin internet: espera y vuelve a intentar
    }
    if (!res) throw new Pausa("Sin conexión. Seguimos cuando vuelva el internet.");
    if (res.status === 429) throw new Pausa("Se alcanzó el límite de hoy para leer cartillas. Sigue mañana.");
    if (!res.ok) {
      p = { ...p, intentos: p.intentos + 1, estado: p.intentos + 1 >= 3 ? "error" : "pendiente", job: undefined };
      await alGuardar(p);
      return p;
    }
    p = { ...p, job, estado: "enviado" };
    await alGuardar(p);
  }
  const inicio = Date.now();
  while (Date.now() - inicio < 16 * 60_000) {
    await espera(4000);
    const res = await fetch(`/api/ia/${p.job}`, { cache: "no-store" }).catch(() => null);
    if (!res) continue;
    const r = await res.json().catch(() => null);
    if (r?.estado === "listo") {
      p = { ...p, estado: "listo", r: r.resultado };
      await alGuardar(p);
      return p;
    }
    if (r?.estado === "error") break;
  }
  p = { ...p, intentos: p.intentos + 1, estado: p.intentos + 1 >= 3 ? "error" : "pendiente", job: undefined };
  await alGuardar(p);
  return p;
}

async function enParalelo<T>(xs: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      while (i < xs.length) await f(xs[i++]);
    }),
  );
}

// ---------- motor (sigue solo, también después de cerrar y volver a abrir la app) ----------
let corriendo = false;
async function motor() {
  if (corriendo) return;
  corriendo = true;
  try {
    for (;;) {
      const c = lista.find((x) => x.fase === "extrayendo" || x.fase === "explicando");
      if (!c) break;
      try {
        if (c.fase === "extrayendo") await extraer(c.id);
        else await explicar(c.id);
      } catch (e) {
        const actual = lista.find((x) => x.id === c.id);
        if (actual) await guardar({ ...actual, error: String((e as Error).message ?? e) });
        if (e instanceof Pausa) {
          await espera(60_000);
          continue;
        }
        if (actual) await guardar({ ...actual, fase: "error", error: String((e as Error).message ?? e) });
      }
    }
  } finally {
    corriendo = false;
  }
}
if (typeof window !== "undefined") window.addEventListener("online", () => void motor());

const actual = (id: string) => {
  const c = lista.find((x) => x.id === id);
  if (!c) throw new Error("La cartilla se borró");
  return c;
};

async function extraer(id: string) {
  const c0 = actual(id);
  const pendientes = Object.entries(c0.paginas)
    .filter(([, p]) => p.estado === "pendiente" || p.estado === "enviado")
    .map(([n]) => Number(n));
  await enParalelo(pendientes, CONCURRENCIA, async (n) => {
    for (;;) {
      const c = actual(id);
      const p = c.paginas[n];
      if (p.estado === "listo" || p.estado === "error") return;
      if (c.error) await guardar({ ...c, error: undefined });
      await trabajo(
        p,
        `${id}-p${n}`,
        async () => {
          const imagenes = [await idb.get<string>("paginas", `${id}:${n}`)];
          const sig = n < c.total ? await idb.get<string>("paginas", `${id}:${n + 1}`) : undefined;
          if (sig) imagenes.push(sig);
          const m = c.materia ? MATERIAS.find((x) => x.id === c.materia)!.nombre : null;
          return { tipo: "extraer", imagenes, materia: m, pagina: n, total: c.total };
        },
        async (np) => {
          const cc = actual(id);
          await guardar({ ...cc, paginas: { ...cc.paginas, [n]: np } });
        },
      );
    }
  });
  await ensamblar(id);
}

// ---------- 3) unir páginas, quitar repetidas y recortar figuras ----------
const norm = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 90);

async function cargarImg(src: string) {
  const im = new Image();
  im.src = src;
  await im.decode();
  return im;
}

async function ensamblar(id: string) {
  const c = actual(id);
  const { cargarBase } = await import("./banco");
  const base = await cargarBase().catch(() => null);
  const conocidas = new Set<string>();
  for (const u of base?.unidades ?? []) for (const q of u.preguntas) conocidas.add(norm(q.enunciado + q.opciones.map((o) => o.t).join("")));
  for (const o of lista) if (o.id !== id) for (const u of o.unidades) for (const q of u.preguntas) conocidas.add(norm(q.enunciado + q.opciones.map((x) => x.t).join("")));

  const imgs = new Map<number, HTMLImageElement>();
  const pagina = async (n: number) => {
    if (!imgs.has(n)) {
      const src = await idb.get<string>("paginas", `${id}:${n}`);
      if (src) imgs.set(n, await cargarImg(src));
    }
    return imgs.get(n);
  };
  const recortar = async (n: number, f: any): Promise<Figura | null> => {
    const im = await pagina(n + (f?.pagina === 1 ? 1 : 0));
    const b = f?.box_2d;
    if (!im || !Array.isArray(b) || b.length !== 4) return null;
    const [y0, x0, y1, x1] = b.map((v: number) => Math.max(0, Math.min(1000, v)) / 1000);
    const sx = x0 * im.naturalWidth;
    const sy = y0 * im.naturalHeight;
    const sw = (x1 - x0) * im.naturalWidth;
    const sh = (y1 - y0) * im.naturalHeight;
    if (sw < 20 || sh < 20) return null;
    const cv = document.createElement("canvas");
    cv.width = Math.round(sw);
    cv.height = Math.round(sh);
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(im, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    // w/h a la escala de las figuras oficiales (el visor las reduce al 62 %)
    return { f: cv.toDataURL("image/jpeg", 0.85), w: Math.round(sw * 0.94), h: Math.round(sh * 0.94), alt: String(f.descripcion ?? "") };
  };
  const figs = async (n: number, xs: any[] | undefined) => (await Promise.all((xs ?? []).map((f) => recortar(n, f)))).filter(Boolean) as Figura[];

  // materia: la elegida o la que más detectó la IA
  const votos = new Map<string, number>();
  for (const p of Object.values(c.paginas)) if (p.r?.materia) votos.set(p.r.materia, (votos.get(p.r.materia) ?? 0) + 1);
  const mayoria = ([...votos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LEC") as MateriaId;

  const claves: Record<string, string> = {};
  for (const p of Object.values(c.paginas)) for (const [k, v] of Object.entries(p.r?.claves ?? {})) if (typeof v === "string") claves[k] = v.trim().toUpperCase().slice(0, 1);

  const vistos = new Set<number>();
  const crudas: Cruda[] = [];
  let repetidas = 0;
  for (let n = 1; n <= c.total; n++) {
    const r = c.paginas[n]?.r;
    if (!r?.unidades) continue;
    const materia = (c.materia ?? (MATERIAS.some((m) => m.id === r.materia) ? r.materia : mayoria)) as MateriaId;
    for (const u of r.unidades) {
      const qs: Cruda["preguntas"] = [];
      for (const q of u.preguntas ?? []) {
        const num = Number(q.n);
        if (!Number.isFinite(num) || vistos.has(num) || !Array.isArray(q.opciones) || q.opciones.length < 2) continue;
        vistos.add(num);
        const huella = norm(String(q.enunciado ?? "") + q.opciones.map((o: any) => String(o.texto ?? "")).join(""));
        if (huella.length > 20 && conocidas.has(huella)) {
          repetidas++;
          continue;
        }
        conocidas.add(huella);
        qs.push({
          n: num,
          enunciado: String(q.enunciado ?? ""),
          figuras: await figs(n, q.figuras),
          opciones: await Promise.all(q.opciones.map(async (o: any) => ({ l: String(o.letra ?? "").toUpperCase().slice(0, 1), t: String(o.texto ?? ""), figuras: await figs(n, o.figuras) }))),
          clave: claves[String(num)] ?? (typeof q.marcada === "string" ? q.marcada.toUpperCase().slice(0, 1) : null),
        });
      }
      if (!qs.length) continue;
      crudas.push({
        id: `c${id}-${qs[0].n}`,
        materia,
        contexto: String(u.contexto ?? ""),
        contextoFiguras: await figs(n, u.contexto_figuras),
        preguntas: qs,
      });
    }
  }
  // claves que aparecieron en páginas posteriores (p. ej. al final de la cartilla)
  for (const u of crudas) for (const q of u.preguntas) q.clave = claves[String(q.n)] ?? q.clave;

  const cc = actual(id);
  if (!crudas.length) {
    await guardar({
      ...cc,
      crudas,
      repetidas,
      fase: "error",
      error: repetidas ? `Las ${repetidas} preguntas de esta cartilla ya estaban en tu banco.` : "No encontramos preguntas de selección múltiple en este archivo.",
    });
    return;
  }
  const exp: Cartilla["exp"] = {};
  for (const u of crudas) exp[u.id] = { estado: "pendiente", intentos: 0 };
  await guardar({ ...cc, crudas, repetidas, exp, fase: "explicando" });
}

// ---------- 4) explicar ----------
async function explicar(id: string) {
  const c0 = actual(id);
  const pendientes = (c0.crudas ?? []).filter((u) => ["pendiente", "enviado"].includes(c0.exp[u.id]?.estado));
  await enParalelo(pendientes, CONCURRENCIA, async (u) => {
    for (;;) {
      const c = actual(id);
      const p = c.exp[u.id];
      if (p.estado === "listo" || p.estado === "error") return;
      await trabajo(
        p,
        `${id}-e${u.preguntas[0].n}`,
        async () => {
          const todas = [...u.contextoFiguras, ...u.preguntas.flatMap((q) => [...q.figuras, ...q.opciones.flatMap((o) => o.figuras)])];
          const desc = (fs: Figura[]) => fs.map((f, k) => ({ k, descripcion: f.alt }));
          return {
            tipo: "explicar",
            materia: u.materia,
            unidad: {
              contexto: u.contexto || null,
              contexto_figuras: desc(u.contextoFiguras),
              preguntas: u.preguntas.map((q) => ({
                n: q.n,
                enunciado: q.enunciado,
                figuras: desc(q.figuras),
                opciones: q.opciones.map((o) => ({ letra: o.l, texto: o.t, figuras: desc(o.figuras) })),
              })),
            },
            claves: Object.fromEntries(u.preguntas.map((q) => [q.n, q.clave])),
            imagenes: todas.slice(0, 6).map((f) => f.f),
          };
        },
        async (np) => {
          const cc = actual(id);
          await guardar({ ...cc, exp: { ...cc.exp, [u.id]: np } });
        },
      );
    }
  });
  await terminar(id);
}

async function terminar(id: string) {
  const c = actual(id);
  const unidades: Unidad[] = [];
  for (const u of c.crudas ?? []) {
    const r = c.exp[u.id]?.r;
    const preguntas: Pregunta[] = [];
    for (const q of u.preguntas) {
      const e = r?.preguntas?.find((x: any) => Number(x.n) === q.n);
      const clave = (q.clave ?? String(e?.clave ?? "").toUpperCase().slice(0, 1)) || "";
      if (!q.opciones.some((o) => o.l === clave)) continue; // sin respuesta confiable: no sirve para practicar
      preguntas.push({
        n: q.n,
        enunciado: q.enunciado,
        figuras: q.figuras,
        opciones: q.opciones,
        clave,
        claveIA: !q.clave,
        afirmacion: null,
        nivel: null,
        tema: String(e?.tema ?? ""),
        subtema: String(e?.subtema ?? ""),
        resumen: String(e?.resumen ?? ""),
        explicacion: String(e?.explicacion ?? ""),
        porque: e?.opciones ?? {},
        trampa: String(e?.trampa ?? ""),
        mejorar: String(e?.que_mejorar ?? ""),
        estrategia: String(e?.estrategia ?? ""),
        dificultad: Number(e?.dificultad) || 2,
        seg: Math.round((Number(e?.segundos) || 90) * RITMO),
      });
    }
    if (!preguntas.length) continue;
    unidades.push({
      id: u.id,
      materia: u.materia,
      examen: null,
      contexto: u.contexto,
      contextoFiguras: u.contextoFiguras,
      segCtx: Math.round((Number(r?.segundos_contexto) || (u.contexto ? 60 : 0)) * RITMO),
      preguntas,
      fuente: { id: c.id, nombre: c.nombre },
    });
  }
  const listo: Cartilla = {
    ...c,
    unidades,
    fase: unidades.length ? "listo" : "error",
    error: unidades.length ? undefined : "No pudimos preparar las preguntas de esta cartilla.",
    crudas: undefined,
    paginas: Object.fromEntries(Object.entries(c.paginas).map(([k, p]) => [k, { estado: p.estado, intentos: p.intentos }])) as Cartilla["paginas"],
    exp: Object.fromEntries(Object.entries(c.exp).map(([k, p]) => [k, { estado: p.estado, intentos: p.intentos }])) as Cartilla["exp"],
  };
  await guardar(listo);
  if (listo.fase === "listo") {
    await idb.delPrefijo("paginas", `${id}:`);
    void subir(listo);
  }
}

// ---------- sincronización entre dispositivos ----------
async function subir(c: Cartilla) {
  const codigo = sync.get().codigo;
  if (!codigo || c.fase !== "listo") return;
  const cuerpo = JSON.stringify({ id: c.id, nombre: c.nombre, materia: c.materia, creado: c.creado, unidades: c.unidades, repetidas: c.repetidas });
  if (cuerpo.length > 5_700_000) return; // muy grande para la nube: se queda solo en este dispositivo
  const r = await fetch(`/api/cartillas/${codigo}/${c.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: cuerpo }).catch(() => null);
  if (r?.ok) {
    const x = lista.find((y) => y.id === c.id);
    if (x) await guardar({ ...x, sincronizada: true });
  }
}

let sincronizando = false;
export async function sincronizarCartillas() {
  const codigo = sync.get().codigo;
  if (!codigo || sincronizando) return;
  sincronizando = true;
  try {
    await listoP;
    const r = await fetch(`/api/cartillas/${codigo}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const remotas = (await r.json()) as { id: string }[];
    const ids = new Set(remotas.map((x) => x.id));
    // borradas en otro dispositivo
    for (const c of lista.filter((x) => x.sincronizada && !ids.has(x.id))) {
      lista = lista.filter((x) => x.id !== c.id);
      await idb.del("cartillas", c.id);
    }
    avisar();
    // nuevas de otro dispositivo
    for (const x of remotas) {
      if (lista.some((c) => c.id === x.id)) continue;
      const rr = await fetch(`/api/cartillas/${codigo}/${x.id}`, { cache: "no-store" }).catch(() => null);
      if (!rr?.ok) continue;
      const d = await rr.json();
      await guardar({ ...d, activa: true, total: 0, fase: "listo", paginas: {}, exp: {}, sincronizada: true });
    }
    // de este dispositivo que aún no se han subido
    for (const c of lista.filter((x) => x.fase === "listo" && !x.sincronizada)) await subir(c);
  } finally {
    sincronizando = false;
  }
}

if (typeof window !== "undefined") {
  let ultimo = sync.get().codigo;
  sync.subscribe(() => {
    const c = sync.get().codigo;
    if (c && c !== ultimo) void sincronizarCartillas();
    ultimo = c;
  });
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void sincronizarCartillas());
}
