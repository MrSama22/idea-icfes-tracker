// Repositorio local (localStorage). Expone una API tipo REST síncrona + suscripción.
// Si en el futuro hay backend, se reemplaza esta capa sin tocar la UI.
import {
  defaultPreguntas,
  elapsedMs,
  type ErrorRegistrado,
  type MateriaId,
  type Practica,
  type Simulacro,
  type TipoId,
} from "./domain";

import { mergeDB, type DB } from "./merge";
export type { DB };

const KEY = "idea-icfes:v1";

const empty = (): DB => ({ version: 1, simulacros: [], errores: [], practicas: [], borrados: {} });

function load(): DB {
  if (typeof localStorage === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as DB;
    if (!Array.isArray(parsed.simulacros) || !Array.isArray(parsed.errores)) return empty();
    return parsed;
  } catch {
    return empty();
  }
}

let state: DB = load();
const listeners = new Set<() => void>();
const localListeners = new Set<() => void>();

function save(next: DB) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
  listeners.forEach((l) => l());
}

/** Cambio hecho por el usuario en este dispositivo (avisa a la sincronización). */
function commit(next: DB) {
  save(next);
  localListeners.forEach((l) => l());
}

const now = () => Date.now();
const tomb = (ids: string[]) => {
  const b = { ...(state.borrados ?? {}) };
  const t = now();
  for (const id of ids) b[id] = t;
  return b;
};

if (typeof window !== "undefined") {
  // Sincroniza entre pestañas
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = load();
      listeners.forEach((l) => l());
    }
  });
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const store = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getState: () => state,
  /** Se llama solo con cambios hechos aquí (no con los que llegan de la nube). */
  onLocalChange(l: () => void) {
    localListeners.add(l);
    return () => localListeners.delete(l);
  },
  /** Mezcla datos que llegan de otro dispositivo. */
  aplicarRemoto(remoto: Partial<DB>) {
    save(mergeDB(state, remoto));
  },

  // --- Simulacros ---
  crearSimulacro(input: {
    nombre: string;
    duracionMin: number;
    preguntas?: Record<MateriaId, number>;
  }) {
    const s: Simulacro = {
      id: uid(),
      nombre: input.nombre.trim() || `Simulacro ${state.simulacros.length + 1}`,
      fecha: new Date().toISOString(),
      duracionMin: input.duracionMin,
      preguntas: input.preguntas ?? defaultPreguntas(),
      acumuladoMs: 0,
      iniciadoEn: null,
      finalizado: false,
      creadoEn: Date.now(),
      updatedAt: Date.now(),
    };
    commit({ ...state, simulacros: [s, ...state.simulacros] });
    return s;
  },
  actualizarSimulacro(id: string, patch: Partial<Simulacro>) {
    commit({
      ...state,
      simulacros: state.simulacros.map((s) =>
        s.id === id ? { ...s, ...patch, updatedAt: now() } : s,
      ),
    });
  },
  eliminarSimulacro(id: string) {
    const hijos = state.errores.filter((e) => e.simulacroId === id).map((e) => e.id);
    commit({
      ...state,
      borrados: tomb([id, ...hijos]),
      simulacros: state.simulacros.filter((s) => s.id !== id),
      errores: state.errores.filter((e) => e.simulacroId !== id),
    });
  },

  // --- Temporizador ---
  toggleTimer(id: string) {
    const s = state.simulacros.find((x) => x.id === id);
    if (!s) return;
    if (s.iniciadoEn) {
      store.actualizarSimulacro(id, { acumuladoMs: elapsedMs(s), iniciadoEn: null });
    } else {
      store.actualizarSimulacro(id, { iniciadoEn: Date.now(), finalizado: false });
    }
  },
  resetTimer(id: string) {
    store.actualizarSimulacro(id, { acumuladoMs: 0, iniciadoEn: null });
  },
  finalizar(id: string) {
    const s = state.simulacros.find((x) => x.id === id);
    if (!s) return;
    store.actualizarSimulacro(id, {
      acumuladoMs: elapsedMs(s),
      iniciadoEn: null,
      finalizado: true,
    });
  },

  // --- Errores (POST /api/errores) ---
  registrarError(input: {
    simulacroId: string;
    materia: MateriaId;
    numeroPregunta: number;
    tipo: TipoId;
    nota?: string;
  }) {
    const s = state.simulacros.find((x) => x.id === input.simulacroId);
    const ms = s ? elapsedMs(s) : 0;
    const e: ErrorRegistrado = {
      id: uid(),
      simulacroId: input.simulacroId,
      materia: input.materia,
      numeroPregunta: input.numeroPregunta,
      tipo: input.tipo,
      nota: (input.nota ?? "").trim(),
      timestamp: Date.now(),
      minuto: s && (s.iniciadoEn || s.acumuladoMs > 0) ? Math.floor(ms / 60000) : null,
      updatedAt: Date.now(),
    };
    commit({ ...state, errores: [e, ...state.errores] });
    return e;
  },
  actualizarError(id: string, patch: Partial<ErrorRegistrado>) {
    commit({ ...state, errores: state.errores.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now() } : e)),
    });
  },
  eliminarError(id: string) {
    commit({ ...state, borrados: tomb([id]), errores: state.errores.filter((e) => e.id !== id) });
  },
  restaurarError(e: ErrorRegistrado) {
    const borrados = { ...(state.borrados ?? {}) };
    delete borrados[e.id];
    commit({
      ...state,
      borrados,
      errores: [{ ...e, updatedAt: now() }, ...state.errores].sort((a, b) => b.timestamp - a.timestamp),
    });
  },

  // --- Simulacros generados (banco oficial) ---
  crearPractica(input: Omit<Practica, "id" | "respuestas" | "marcadas" | "actual" | "acumuladoMs" | "iniciadoEn" | "finalizado" | "creadoEn" | "updatedAt">) {
    const p: Practica = {
      ...input,
      id: uid(),
      respuestas: {},
      marcadas: [],
      actual: 0,
      acumuladoMs: 0,
      iniciadoEn: null,
      finalizado: false,
      creadoEn: now(),
      updatedAt: now(),
    };
    commit({ ...state, practicas: [p, ...(state.practicas ?? [])] });
    return p;
  },
  actualizarPractica(id: string, patch: Partial<Practica> | ((p: Practica) => Partial<Practica>)) {
    commit({
      ...state,
      practicas: (state.practicas ?? []).map((p) =>
        p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch), updatedAt: now() } : p,
      ),
    });
  },
  eliminarPractica(id: string) {
    commit({ ...state, borrados: tomb([id]), practicas: (state.practicas ?? []).filter((p) => p.id !== id) });
  },
  /** Crea en el registro de errores un simulacro con los fallos (alimenta los análisis existentes). */
  registrarFallos(practicaId: string, input: {
    nombre: string;
    duracionMin: number;
    acumuladoMs: number;
    preguntas: Record<MateriaId, number>;
    errores: { materia: MateriaId; numeroPregunta: number; tipo: TipoId; nota: string }[];
  }) {
    const t = now();
    const s: Simulacro = {
      id: uid(),
      nombre: input.nombre,
      fecha: new Date().toISOString(),
      duracionMin: input.duracionMin,
      preguntas: input.preguntas,
      acumuladoMs: input.acumuladoMs,
      iniciadoEn: null,
      finalizado: true,
      creadoEn: t,
      updatedAt: t,
    };
    const errores: ErrorRegistrado[] = input.errores.map((e, i) => ({
      id: uid(),
      simulacroId: s.id,
      materia: e.materia,
      numeroPregunta: e.numeroPregunta,
      tipo: e.tipo,
      nota: e.nota,
      timestamp: t - i,
      minuto: null,
      updatedAt: t,
    }));
    commit({
      ...state,
      simulacros: [s, ...state.simulacros],
      errores: [...errores, ...state.errores],
      practicas: (state.practicas ?? []).map((p) => (p.id === practicaId ? { ...p, registroId: s.id, updatedAt: t } : p)),
    });
    return s;
  },

  // --- Respaldo ---
  exportar(): string {
    return JSON.stringify(state, null, 2);
  },
  importar(json: string, modo: "reemplazar" | "combinar") {
    const data = JSON.parse(json) as DB;
    if (!Array.isArray(data.simulacros) || !Array.isArray(data.errores)) {
      throw new Error("Archivo inválido");
    }
    if (modo === "reemplazar") {
      // Lo que no viene en el archivo se marca como borrado; lo importado cuenta como recién editado.
      const t = now();
      const ids = new Set([...data.simulacros, ...data.errores, ...(data.practicas ?? [])].map((x) => x.id));
      const fuera = [...state.simulacros, ...state.errores, ...(state.practicas ?? [])]
        .map((x) => x.id)
        .filter((id) => !ids.has(id));
      const borrados = tomb(fuera);
      for (const id of ids) delete borrados[id];
      commit({
        version: 1,
        simulacros: data.simulacros.map((s) => ({ ...s, updatedAt: t })),
        errores: data.errores.map((e) => ({ ...e, updatedAt: t })),
        practicas: (data.practicas ?? []).map((p) => ({ ...p, updatedAt: t })),
        borrados,
      });
      return;
    }
    commit(mergeDB(state, data));
  },
};
