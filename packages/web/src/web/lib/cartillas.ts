// Cartillas subidas por el estudiante (PDF o fotos) → preguntas nuevas para el banco.
// 1) Se dibuja cada página en el navegador. 2) La IA transcribe las preguntas página por página.
// 3) Se recortan las figuras. 4) La IA explica cada pregunta (y la resuelve si la cartilla no trae clave).
// Todo queda en el dispositivo (IndexedDB) y, si hay una cuenta, también en la nube de esa cuenta.
import { useSyncExternalStore } from "react";
import { idb } from "./idb";
import { auth } from "./auth";
import { MATERIAS, type MateriaId } from "./domain";
import type { Figura, Pregunta, Unidad } from "./banco";

export type Fase = "leyendo" | "extrayendo" | "explicando" | "listo" | "error";
interface Paso {
  job?: string;
  estado: "pendiente" | "enviado" | "listo" | "error";
  intentos: number;
  r?: any;
  /** motivo del fallo, para no perderlo cuando la IA no responde */
  error?: string;
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
  /** preguntas que no se pudieron usar por no traer respuesta correcta */
  descartadas?: number;
  exp: Record<string, Paso>;
  unidades: Unidad[];
  sincronizada?: boolean;
  /** el administrador la publicó para todas las cuentas */
  global?: boolean;
}

const MAX_PAGINAS = 120;
const CONCURRENCIA = 4;
const RITMO = 1.35;

// ---------- estado en memoria + suscripción ----------
let lista: Cartilla[] = [];
let globales: Cartilla[] = [];
/** Aviso del último intento de subida (se muestra en la página de cartillas). */
let aviso: string | null = null;
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

/**
 * Una página que continúa el texto (o la tabla) de la página anterior llega sin contexto: el material
 * quedó en la unidad de la página previa. Si la numeración sigue y la unidad no trae texto propio, se
 * hereda el de la anterior, que es el mismo bloque («RESPONDA LAS PREGUNTAS 1 A 13…»).
 */
export function heredarContexto(us: Unidad[]): Unidad[] {
  const salida: Unidad[] = [];
  const previa = new Map<MateriaId, Unidad>();
  for (const u of us) {
    const p = previa.get(u.materia);
    const ultimaN = p?.preguntas[p.preguntas.length - 1]?.n;
    const sigue = ultimaN !== undefined && u.preguntas[0]?.n === ultimaN + 1;
    const vacia = !u.contexto && !u.contextoFiguras.length;
    const hereda = vacia && sigue && !!(p!.contexto || p!.contextoFiguras.length);
    const fin = hereda ? { ...u, contexto: p!.contexto, contextoFiguras: p!.contextoFiguras } : u;
    salida.push(fin);
    // Encadenada: si la página siguiente también continúa, hereda igual.
    previa.set(u.materia, fin);
  }
  return salida;
}

export const cartillas = {
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  get: () => lista,
  listo: () => listoP,
  /** Unidades listas de las cartillas activas + las globales (se suman al banco). */
  unidades(): Unidad[] {
    const propias = lista.filter((c) => c.fase === "listo" && c.activa).flatMap((c) => heredarContexto(c.unidades));
    const todas = [...propias, ...globales.flatMap((c) => heredarContexto(c.unidades))];
    // Una cartilla publicada por el admin sale en sus dos listas: no duplicamos sus preguntas.
    const vistos = new Set<string>();
    return todas.filter((u) => {
      if (vistos.has(u.id)) return false;
      vistos.add(u.id);
      return true;
    });
  },
  async alternar(id: string) {
    const c = lista.find((x) => x.id === id);
    if (c) await guardar({ ...c, activa: !c.activa });
  },
  /** Solo administrador: publica una cartilla ya subida para todas las cuentas (o la vuelve privada). */
  async publicar(id: string, global: boolean) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    const n: Cartilla = { ...c, global: global || undefined, sincronizada: false };
    await guardar(n);
    const ok = await subir(n);
    if (!ok) {
      await guardar(c);
      avisarError("No se pudo cambiar la visibilidad de la cartilla. Revisa tu conexión e inténtalo otra vez.");
      return;
    }
    // Se mueve entre «mis cartillas» y «globales»: borra la copia del otro lado.
    if (auth.get().cuenta) {
      await fetch(`/api/${global ? "cartillas" : "global"}/${id}`, { method: "DELETE" }).catch(() => {});
    }
    await cargarGlobales();
  },
  async renombrar(id: string, nombre: string) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    const n = { ...c, nombre, sincronizada: false };
    await guardar(n);
    void subir(n);
  },
  /**
   * Borra una cartilla de mi cuenta. Si estaba compartida con todas las cuentas, `tambienGlobal`
   * decide si desaparece para todos o solo de mi lista (entonces sigue en «Cartillas globales»).
   */
  async eliminar(id: string, tambienGlobal = false) {
    const c = lista.find((x) => x.id === id);
    lista = lista.filter((x) => x.id !== id);
    avisar();
    await idb.del("cartillas", id);
    await idb.delPrefijo("paginas", `${id}:`);
    if (auth.get().cuenta) {
      if (c?.global && tambienGlobal) await fetch(`/api/global/${id}`, { method: "DELETE" }).catch(() => {});
      // Una cartilla publicada solo vive en la nube de las globales; si no, su copia es la de mi cuenta.
      if (!c?.global || tambienGlobal) await fetch(`/api/cartillas/${id}`, { method: "DELETE" }).catch(() => {});
      if (c?.global) await cargarGlobales();
    }
  },
  /** Solo administrador: borra una cartilla global para todas las cuentas. */
  async eliminarGlobal(id: string) {
    globales = globales.filter((x) => x.id !== id);
    avisar();
    if (auth.get().cuenta) await fetch(`/api/global/${id}`, { method: "DELETE" }).catch(() => {});
    // Si la global también estaba en mi cuenta, no se pierde el trabajo: queda como cartilla privada.
    const mia = lista.find((x) => x.id === id);
    if (mia) {
      const privada: Cartilla = { ...mia, global: undefined, sincronizada: false };
      await guardar(privada);
      void subir(privada);
    }
    await cargarGlobales();
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

const limpiar = (s: string) =>
  s
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

function avisarError(txt: string) {
  aviso = txt;
  avisar();
}

export function limpiarAviso() {
  aviso = null;
  avisar();
}

export function useAviso() {
  return useSyncExternalStore(cartillas.subscribe, () => aviso, () => aviso);
}

/** Mensaje real cuando ninguna página produjo preguntas. */
function mensajeFallo(fallos: string[], total: number) {
  const todo = fallos.join(" ").toLowerCase();
  if (todo.includes("openai_api_key") || todo.includes("ai_gateway_api_key") || todo.includes("falta openai")) {
    return "La lectura con IA no está configurada en el servidor (falta GEMINI_API_KEY, OPENROUTER_API_KEY u OPENAI_API_KEY), así que no se pudieron leer las páginas.";
  }
  // Se agotaron todos los topes de las claves guardadas: no es un fallo del archivo.
  if (todo.includes("se agotaron tus") || todo.includes("sin cupo") || todo.includes("no lee imágenes")) {
    return "Se agotaron los topes gratuitos de todas tus claves de IA (cada servicio gratis tiene su cupo diario). Nada se perdió: pega otra clave en «Tu clave de IA» —de Gemini, Groq, OpenRouter o Mistral, que son gratis— y pulsa «Reintentar». La app va cambiando sola de una a otra.";
  }
  if (todo.includes("openrouter") && (todo.includes("429") || todo.includes("rate limit") || todo.includes("free-model"))) {
    return "OpenRouter llegó a su tope gratuito (20 peticiones por minuto y 50 al día). Espera un poco o pon otra clave.";
  }
  // Gemini gratis se queda sin cuota por minuto o por día; eso NO es falta de saldo.
  if (todo.includes("gemini") && (todo.includes("429") || todo.includes("resource_exhausted") || todo.includes("quota"))) {
    return "Gemini gratis alcanzó su tope de cuota (tiene un límite por minuto y otro por día), así que no se pudieron leer las páginas. Nada se perdió: espera un minuto y pulsa «Reintentar». Si la cartilla tiene muchas páginas, ve subiéndola por partes o usa una clave de OpenRouter (sk-or-…) o de OpenAI con saldo.";
  }
  if (todo.includes("insufficient_quota") || todo.includes("exceeded your current quota") || todo.includes("no credits remaining")) {
    return "La cuenta de IA se quedó sin saldo, así que no se pudieron leer las páginas. Añade créditos a la API o usa otra clave.";
  }
  if (fallos.length) {
    return `No se pudieron leer ${fallos.length} de ${total} páginas. ${limpiar(fallos[0])}`;
  }
  return "No encontramos preguntas de selección múltiple en este archivo.";
}

/** Quita la cartilla de la lista y del dispositivo (subida cancelada). */
async function descartar(id: string) {
  lista = lista.filter((x) => x.id !== id);
  avisar();
  await idb.del("cartillas", id);
  await idb.delPrefijo("paginas", `${id}:`);
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

const esPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** Materia por el nombre del archivo (los cuadernillos del ICFES la traen en el nombre). */
function materiaDelNombre(nombre: string): MateriaId | null {
  const s = nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/sociales|ciudadan|historia|geograf/.test(s)) return "SOC";
  if (/ciencias|naturales|biolog|fisic|quimic/.test(s)) return "CIE";
  if (/lectura|critica|reading/.test(s)) return "LEC";
  if (/matematic|math/.test(s)) return "MAT";
  if (/ingles|english/.test(s)) return "ING";
  return null;
}

/**
 * Sube los archivos elegidos. Cada PDF queda como una cartilla propia (puedes subir varios de una vez);
 * las fotos sueltas se agrupan en una sola cartilla.
 */
export async function subirArchivos(
  files: File[],
  nombre: string,
  materia: MateriaId | null,
  onPaso?: (txt: string) => void,
  global = false,
): Promise<Cartilla[]> {
  const grupos: { archivos: File[]; base: string }[] = [];
  let fotos: File[] = [];
  const cerrarFotos = () => {
    if (fotos.length) {
      grupos.push({ archivos: fotos, base: "" });
      fotos = [];
    }
  };
  for (const f of files) {
    if (esPdf(f)) {
      cerrarFotos();
      grupos.push({ archivos: [f], base: f.name.replace(/\.[^.]+$/, "") });
    } else fotos.push(f);
  }
  cerrarFotos();

  const hechas: Cartilla[] = [];
  const errores: string[] = [];
  for (const g of grupos) {
    // Con un nombre escrito y varios archivos, se le añade el nombre del PDF para distinguirlas.
    const titulo = nombre.trim()
      ? grupos.length > 1
        ? `${nombre.trim()} · ${g.base || "fotos"}`
        : nombre.trim()
      : g.base;
    try {
      hechas.push(await subirUno(g.archivos, titulo, materia, onPaso, global));
    } catch (e) {
      errores.push(String((e as Error).message ?? e));
    }
  }
  if (!hechas.length && errores.length) throw new Error(errores[0]);
  if (errores.length) {
    avisarError(
      `No se ${errores.length === 1 ? "pudo subir 1 archivo" : `pudieron subir ${errores.length} archivos`}: ${errores[0]}`,
    );
  }
  return hechas;
}

async function subirUno(
  files: File[],
  nombre: string,
  materia: MateriaId | null,
  onPaso?: (txt: string) => void,
  global = false,
): Promise<Cartilla> {
  const id = uid();
  // Si no eligió materia, se deduce del nombre del archivo (ej. «...-cuadernillo-ingles-sab...»).
  const materiaAuto = materia ?? materiaDelNombre(files.map((f) => f.name).join(" "));
  const c: Cartilla = {
    id,
    nombre: nombre.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "Mi cartilla",
    materia: materiaAuto,
    creado: Date.now(),
    activa: true,
    total: 0,
    fase: "leyendo",
    paginas: {},
    exp: {},
    unidades: [],
    global: global || undefined,
  };
  await guardar(c);
  try {
    let n = 0;
    for (const f of files) {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        const pdfjs = await import("pdfjs-dist");
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const tarea = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) });
        const doc = await tarea.promise;
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
          try { page.cleanup(); } catch { /* sin importancia */ }
        }
        try { await tarea.destroy(); } catch { /* sin importancia */ }
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
    if (res.status === 402) {
      // Sin clave de IA en la cuenta: no tiene sentido reintentar.
      const d = await res.json().catch(() => null);
      throw new Error(String((d as { error?: string } | null)?.error ?? "Añade tu clave de IA para leer cartillas."));
    }
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
    if (r?.estado === "error") {
      p = { ...p, error: String(r.error ?? "").slice(0, 400) };
      break;
    }
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
// Huella de una pregunta. Debe ser el texto COMPLETO: si se recorta, dos preguntas distintas
// que comparten el inicio (el texto de lectura de un grupo de preguntas, por ejemplo) se toman
// por la misma y la cartilla se cancelaba como «repetida» sin serlo.
const norm = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]/g, "");

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

  const esMateria = (x: unknown): x is MateriaId => MATERIAS.some((m) => m.id === x);

  // materia: la elegida, la de cada pregunta, o la que más detectó la IA
  const votos = new Map<string, number>();
  for (const p of Object.values(c.paginas)) if (p.r?.materia) votos.set(p.r.materia, (votos.get(p.r.materia) ?? 0) + 1);
  const mayoria = ([...votos].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "LEC") as MateriaId;

  const clavesDe = (r: any): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r?.claves ?? {})) if (typeof v === "string") out[k] = v.trim().toUpperCase().slice(0, 1);
    return out;
  };
  // Tabla de claves suelta (normalmente al final de la cartilla).
  const clavesSueltas: Record<string, string> = {};
  for (const p of Object.values(c.paginas)) Object.assign(clavesSueltas, clavesDe(p.r));

  // Se deduplica por pregunta Y materia: una cartilla mixta puede numerar 1..25 en cada materia
  // y antes la segunda materia se perdía entera por «número repetido».
  const vistas = new Map<string, number>(); // "materia:número" → página donde salió
  // Huellas de las preguntas de ESTA cartilla: si se repiten entre páginas se descartan sin
  // contar como «ya estaban en tu banco» (eso cancelaba subidas de cartillas nuevas).
  const deEsta = new Set<string>();
  const crudas: Cruda[] = [];
  let repetidas = 0;
  for (let n = 1; n <= c.total; n++) {
    const r = c.paginas[n]?.r;
    if (!r?.unidades) continue;
    const clavesPagina = clavesDe(r);
    const materiaPagina = (c.materia ?? (esMateria(r.materia) ? r.materia : mayoria)) as MateriaId;
    for (const u of r.unidades) {
      // Una unidad con una figura dañada no debe botar el resto de la cartilla.
      try {
        const materiaUnidad = (c.materia ?? (esMateria(u.materia) ? u.materia : materiaPagina)) as MateriaId;
        const porMateria = new Map<MateriaId, Cruda["preguntas"]>();
        for (const q of u.preguntas ?? []) {
          const num = Number(q.n);
          if (!Number.isFinite(num) || !Array.isArray(q.opciones) || q.opciones.length < 2) continue;
          // La IA marca la materia de cada pregunta; si la cartilla mezcla materias, cada una va a la suya.
          const materiaQ = (c.materia ?? (esMateria(q.materia) ? q.materia : materiaUnidad)) as MateriaId;
          const marca = `${materiaQ}:${num}`;
          // Solo se ignora si la misma pregunta venía de la página anterior (solapamiento de las
          // dos imágenes del mismo envío). Si el número se repite varias páginas después, es otra
          // pregunta: antes se perdían secciones enteras que reinician la numeración.
          const antes = vistas.get(marca);
          if (antes !== undefined && n - antes <= 1) continue;
          vistas.set(marca, n);
          const huella = norm(String(q.enunciado ?? "") + q.opciones.map((o: any) => String(o.texto ?? "")).join(""));
          if (huella.length > 40) {
            // «Repetida» = ya está en el banco o en otra cartilla terminada (no en esta misma).
            if (conocidas.has(huella)) {
              repetidas++;
              continue;
            }
            if (deEsta.has(huella)) continue;
            deEsta.add(huella);
          }
          const clave =
            clavesPagina[String(num)] ??
            clavesSueltas[String(num)] ??
            (typeof q.marcada === "string" ? q.marcada.toUpperCase().slice(0, 1) : null);
          const qs = porMateria.get(materiaQ) ?? [];
          qs.push({
            n: num,
            enunciado: String(q.enunciado ?? ""),
            figuras: await figs(n, q.figuras),
            opciones: await Promise.all(q.opciones.map(async (o: any) => ({ l: String(o.letra ?? "").toUpperCase().slice(0, 1), t: String(o.texto ?? ""), figuras: await figs(n, o.figuras) }))),
            clave,
          });
          porMateria.set(materiaQ, qs);
        }
        for (const [materiaQ, qs] of porMateria) {
          if (!qs.length) continue;
          crudas.push({
            id: `c${id}-p${n}-${materiaQ}-${qs[0].n}`,
            materia: materiaQ,
            contexto: String(u.contexto ?? ""),
            contextoFiguras: await figs(n, u.contexto_figuras),
            preguntas: qs,
          });
        }
      } catch {
        /* seguimos con las demás unidades: lo que sí se leyó se conserva */
      }
    }
  }

  // Si la IA repartió una cartilla de una sola materia entre varias, manda la mayoría clara.
  if (!c.materia && crudas.length) {
    const cuenta = new Map<MateriaId, number>();
    for (const u of crudas) cuenta.set(u.materia, (cuenta.get(u.materia) ?? 0) + u.preguntas.length);
    const totalQ = [...cuenta.values()].reduce((a, b) => a + b, 0);
    const top = [...cuenta].sort((a, b) => b[1] - a[1])[0];
    if (top && totalQ >= 10 && top[1] / totalQ >= 0.8) for (const u of crudas) u.materia = top[0];
  }

  const cc = actual(id);
  // Solo se cancela si la cartilla NO aporta nada nuevo (todas sus preguntas ya estaban).
  // Antes bastaban 3 coincidencias para botar la cartilla entera, así que una cartilla nueva
  // que comparte unas pocas preguntas con el banco o con otra cartilla se perdía sin razón.
  const nuevas = crudas.reduce((a, u) => a + u.preguntas.length, 0);
  if (repetidas > 2 && nuevas === 0) {
    await descartar(id);
    avisarError(`«${cc.nombre}» no se agregó: ${repetidas} de sus preguntas ya estaban en tu banco.`);
    throw new Error("Cartilla repetida");
  }
  if (!crudas.length) {
    const fallos = Object.values(cc.paginas)
      .map((p) => p.error)
      .filter((x): x is string => !!x);
    await guardar({ ...cc, crudas, repetidas, fase: "error", error: mensajeFallo(fallos, cc.total) });
    return;
  }
  const exp: Cartilla["exp"] = {};
  for (const u of crudas) exp[u.id] = { estado: "pendiente", intentos: 0 };
  // Si alguna página falló, la cartilla sigue con lo que sí se leyó y lo dice claramente.
  const fallidas = Object.values(cc.paginas).filter((p) => p.estado === "error").length;
  const aviso = fallidas
    ? `Se leyeron ${Math.max(0, cc.total - fallidas)} de ${cc.total} páginas. Las ${fallidas} que fallaron no se perdieron: puedes reintentar más tarde sin perder las preguntas que sí quedaron.`
    : undefined;
  await guardar({ ...cc, crudas, repetidas, error: aviso, exp, fase: "explicando" });
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
  let descartadas = 0;
  for (const u of c.crudas ?? []) {
    const r = c.exp[u.id]?.r;
    const preguntas: Pregunta[] = [];
    for (const q of u.preguntas) {
      const e = r?.preguntas?.find((x: any) => Number(x.n) === q.n);
      const clave = (q.clave ?? String(e?.clave ?? "").toUpperCase().slice(0, 1)) || "";
      if (!q.opciones.some((o) => o.l === clave)) {
        descartadas++; // sin respuesta confiable: no sirve para practicar
        continue;
      }
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
  const sinExplicar = Object.values(c.exp).filter((p) => p.estado === "error").length;
  const notas = [
    c.error,
    sinExplicar
      ? `${sinExplicar} bloque${sinExplicar === 1 ? "" : "s"} de preguntas no se pudo${sinExplicar === 1 ? "" : "ieron"} explicar; las demás quedaron guardadas.`
      : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const listo: Cartilla = {
    ...c,
    unidades,
    descartadas: descartadas || undefined,
    fase: unidades.length ? "listo" : "error",
    error: unidades.length ? notas || undefined : notas || "No pudimos preparar las preguntas de esta cartilla.",
    // Si no se pudo preparar nada, conservamos lo leído para reintentar solo la explicación
    // (sin volver a leer ni gastar IA en las páginas).
    crudas: unidades.length ? undefined : c.crudas,
    paginas: Object.fromEntries(Object.entries(c.paginas).map(([k, p]) => [k, { estado: p.estado, intentos: p.intentos }])) as Cartilla["paginas"],
    exp: Object.fromEntries(Object.entries(c.exp).map(([k, p]) => [k, { estado: p.estado, intentos: p.intentos }])) as Cartilla["exp"],
  };
  await guardar(listo);
  if (listo.fase === "listo") {
    await idb.delPrefijo("paginas", `${id}:`);
    void subir(listo);
  }
}

// ---------- sincronización con la cuenta ----------

/** Cartillas globales: las publica el administrador y las usa todo el mundo (solo lectura). */
export async function cargarGlobales() {
  if (!auth.get().cuenta) {
    if (globales.length) {
      globales = [];
      avisar();
    }
    return;
  }
  const r = await fetch("/api/global", { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return;
  const indice = (await r.json().catch(() => null)) as { id: string }[] | null;
  if (!Array.isArray(indice)) return;
  const nuevas: Cartilla[] = [];
  for (const x of indice) {
    const rr = await fetch(`/api/global/${x.id}`, { cache: "no-store" }).catch(() => null);
    if (!rr?.ok) continue;
    const d = await rr.json().catch(() => null);
    if (d) nuevas.push({ ...d, activa: true, total: 0, fase: "listo", paginas: {}, exp: {}, sincronizada: true, global: true });
  }
  globales = nuevas;
  avisar();
}

export function useGlobales() {
  return useSyncExternalStore(cartillas.subscribe, () => globales, () => globales);
}

/** Huella de las globales para que el banco se recomponga cuando cambian. */
export const firmaGlobal = () =>
  globales.map((c) => `${c.id}:${c.unidades.reduce((a, u) => a + u.preguntas.length, 0)}`).join("|");

/** Al cerrar sesión se van las cartillas de la cuenta, para que otra persona no las vea. */
export async function cerrarCuenta() {
  globales = [];
  const fuera = lista.filter((c) => c.sincronizada || c.global);
  lista = lista.filter((c) => !fuera.includes(c));
  for (const c of fuera) await idb.del("cartillas", c.id);
  avisar();
}

async function subir(c: Cartilla): Promise<boolean> {
  if (!auth.get().cuenta || c.fase !== "listo") return false;
  const cuerpo = JSON.stringify({ id: c.id, nombre: c.nombre, materia: c.materia, creado: c.creado, unidades: c.unidades, repetidas: c.repetidas, descartadas: c.descartadas, global: !!c.global });
  if (cuerpo.length > 5_700_000) {
    // Muy grande para la nube: se conserva en este dispositivo y se avisa en la lista.
    const x = lista.find((y) => y.id === c.id);
    if (x && !x.error)
      await guardar({
        ...x,
        error: "Se guardó en este dispositivo. Es demasiado grande para tu cuenta, así que no se verá en otros equipos.",
      });
    return false;
  }
  const ruta = c.global ? `/api/global/${c.id}` : `/api/cartillas/${c.id}`;
  const r = await fetch(ruta, { method: "PUT", headers: { "content-type": "application/json" }, body: cuerpo }).catch(() => null);
  if (!r?.ok) return false;
  const x = lista.find((y) => y.id === c.id);
  if (x) await guardar({ ...x, sincronizada: true });
  if (c.global) await cargarGlobales();
  return true;
}

let sincronizando = false;

export async function sincronizarCartillas() {
  if (!auth.get().cuenta) {
    if (globales.length) {
      globales = [];
      avisar();
    }
    return;
  }
  if (sincronizando) return;
  sincronizando = true;
  try {
    await listoP;
    await cargarGlobales();
    const r = await fetch("/api/cartillas", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const remotas = (await r.json()) as { id: string }[];
    const ids = new Set(remotas.map((x) => x.id));
    // borradas en otro dispositivo
    for (const c of lista.filter((x) => x.sincronizada && !x.global && !ids.has(x.id))) {
      lista = lista.filter((x) => x.id !== c.id);
      await idb.del("cartillas", c.id);
    }
    avisar();
    // nuevas de otro dispositivo
    for (const x of remotas) {
      if (lista.some((c) => c.id === x.id)) continue;
      const rr = await fetch(`/api/cartillas/${x.id}`, { cache: "no-store" }).catch(() => null);
      if (!rr?.ok) continue;
      const d = await rr.json().catch(() => null);
      if (d) await guardar({ ...d, activa: true, total: 0, fase: "listo", paginas: {}, exp: {}, sincronizada: true });
    }
    // de este dispositivo que aún no se han subido
    for (const c of lista.filter((x) => x.fase === "listo" && !x.sincronizada)) await subir(c);
  } finally {
    sincronizando = false;
  }
}

if (typeof window !== "undefined") {
  auth.subscribe(() => void sincronizarCartillas());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void sincronizarCartillas();
  });
}
