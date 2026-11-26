// Preferencias de la app guardadas solo en este dispositivo.
// Van aparte de la base de simulacros para no tocar el formato que se sincroniza.
import { useSyncExternalStore } from "react";

export interface Ajustes {
  /** Al terminar un simulacro, preguntar por qué se dejaron preguntas sin responder. */
  preguntarBlancas: boolean;
}

const KEY = "idea-icfes:ajustes";

const DEFECTO: Ajustes = {
  // Activado por defecto, como se pidió: el motivo mejora la retroalimentación.
  preguntarBlancas: true,
};

function leer(): Ajustes {
  if (typeof localStorage === "undefined") return { ...DEFECTO };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFECTO, ...(JSON.parse(raw) as Partial<Ajustes>) } : { ...DEFECTO };
  } catch {
    return { ...DEFECTO };
  }
}

let state: Ajustes = leer();
const subs = new Set<() => void>();

export const ajustes = {
  subscribe(l: () => void) {
    subs.add(l);
    return () => subs.delete(l);
  },
  get: () => state,
  set(patch: Partial<Ajustes>) {
    state = { ...state, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
    subs.forEach((l) => l());
  },
};

export function useAjustes() {
  return useSyncExternalStore(ajustes.subscribe, ajustes.get, ajustes.get);
}
