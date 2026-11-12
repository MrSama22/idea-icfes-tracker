// Repositorio local (localStorage). Expone una API tipo REST síncrona + suscripción.
// Si en el futuro hay backend, se reemplaza esta capa sin tocar la UI.
import {
  defaultPreguntas,
  elapsedMs,
  type ErrorRegistrado,
  type MateriaId,
  type Simulacro,
  type TipoId,
} from "./domain";

const KEY = "idea-icfes:v1";

export interface DB {
  version: 1;
  simulacros: Simulacro[];
  errores: ErrorRegistrado[];
}

const empty = (): DB => ({ version: 1, simulacros: [], errores: [] });

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

function commit(next: DB) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
  listeners.forEach((l) => l());
}

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
    };
    commit({ ...state, simulacros: [s, ...state.simulacros] });
    return s;
  },
  actualizarSimulacro(id: string, patch: Partial<Simulacro>) {
    commit({
      ...state,
      simulacros: state.simulacros.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  },
  eliminarSimulacro(id: string) {
    commit({
      ...state,
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
    };
    commit({ ...state, errores: [e, ...state.errores] });
    return e;
  },
  actualizarError(id: string, patch: Partial<ErrorRegistrado>) {
    commit({ ...state, errores: state.errores.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  },
  eliminarError(id: string) {
    commit({ ...state, errores: state.errores.filter((e) => e.id !== id) });
  },
  restaurarError(e: ErrorRegistrado) {
    commit({ ...state, errores: [e, ...state.errores].sort((a, b) => b.timestamp - a.timestamp) });
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
      commit({ version: 1, simulacros: data.simulacros, errores: data.errores });
      return;
    }
    const sIds = new Set(state.simulacros.map((s) => s.id));
    const eIds = new Set(state.errores.map((e) => e.id));
    commit({
      version: 1,
      simulacros: [...state.simulacros, ...data.simulacros.filter((s) => !sIds.has(s.id))].sort(
        (a, b) => b.creadoEn - a.creadoEn,
      ),
      errores: [...state.errores, ...data.errores.filter((e) => !eIds.has(e.id))],
    });
  },
};
