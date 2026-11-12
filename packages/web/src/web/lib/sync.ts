// Sincronización celular ↔ PC con un "código de sincronización".
// Los datos siguen guardándose en el dispositivo (funciona sin internet);
// cuando hay conexión se mezclan con la copia en la nube (/api/sync/:codigo).
import { useSyncExternalStore } from "react";
import { store } from "./store";
import { huella, type DB } from "./merge";

const KEY = "idea-icfes:sync";
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I

export type Estado = "apagado" | "sincronizando" | "ok" | "sin-conexion" | "error";

interface SyncState {
  codigo: string | null;
  estado: Estado;
  ultima: number | null; // epoch ms de la última sincronización exitosa
  mensaje?: string;
}

function leer(): SyncState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as { codigo?: string; ultima?: number };
      if (p.codigo) return { codigo: p.codigo, estado: "ok", ultima: p.ultima ?? null };
    }
  } catch {
    /* nada */
  }
  return { codigo: null, estado: "apagado", ultima: null };
}

let s: SyncState = typeof localStorage === "undefined" ? { codigo: null, estado: "apagado", ultima: null } : leer();
const subs = new Set<() => void>();
function set(patch: Partial<SyncState>) {
  s = { ...s, ...patch };
  try {
    if (s.codigo) localStorage.setItem(KEY, JSON.stringify({ codigo: s.codigo, ultima: s.ultima }));
    else localStorage.removeItem(KEY);
  } catch {
    /* nada */
  }
  subs.forEach((l) => l());
}

export const normalizar = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const formatear = (c: string) => normalizar(c).replace(/(.{4})(?=.)/g, "$1-");
export const codigoValido = (c: string) => /^[A-Z0-9]{12}$/.test(normalizar(c));

function generar() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

let enCurso: Promise<void> | null = null;
let otraVez = false;

/** Envía lo de este dispositivo, recibe la mezcla de la nube y la aplica. */
export function sincronizar(): Promise<void> {
  if (!s.codigo) return Promise.resolve();
  if (enCurso) {
    otraVez = true;
    return enCurso;
  }
  enCurso = (async () => {
    const codigo = s.codigo!;
    set({ estado: "sincronizando" });
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new TypeError("offline");
      const local = store.getState();
      const res = await fetch(`/api/sync/${codigo}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(local),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remoto = (await res.json()) as DB;
      if (s.codigo !== codigo) return; // se desconectó mientras tanto
      const antes = huella(store.getState());
      store.aplicarRemoto(remoto);
      // Si mientras viajaba hubo cambios aquí, vuelve a enviar
      if (antes !== huella(local)) otraVez = true;
      set({ estado: "ok", ultima: Date.now(), mensaje: undefined });
    } catch (e) {
      const offline = e instanceof TypeError;
      set({
        estado: offline ? "sin-conexion" : "error",
        mensaje: offline ? "Sin internet: se sincroniza al volver la conexión." : "No se pudo sincronizar.",
      });
    } finally {
      enCurso = null;
      if (otraVez) {
        otraVez = false;
        setTimeout(() => void sincronizar(), 300);
      }
    }
  })();
  return enCurso;
}

export const sync = {
  subscribe(l: () => void) {
    subs.add(l);
    return () => subs.delete(l);
  },
  get: () => s,
  /** Crea un código nuevo y sube los datos de este dispositivo. */
  async activar() {
    set({ codigo: generar(), estado: "sincronizando", ultima: null });
    await sincronizar();
  },
  /** Conecta este dispositivo a un código ya existente (une ambos datos). */
  async conectar(codigo: string) {
    const c = normalizar(codigo);
    if (!codigoValido(c)) throw new Error("El código debe tener 12 letras o números.");
    const res = await fetch(`/api/sync/${c}`, { cache: "no-store" }).catch(() => null);
    if (!res) throw new Error("Sin internet. Conéctate e inténtalo de nuevo.");
    if (res.status === 404) throw new Error("Ese código no existe. Revísalo en tu otro dispositivo.");
    if (!res.ok) throw new Error("No se pudo conectar. Inténtalo de nuevo.");
    set({ codigo: c, estado: "sincronizando", ultima: null });
    await sincronizar();
  },
  desconectar() {
    set({ codigo: null, estado: "apagado", ultima: null, mensaje: undefined });
  },
};

export function useSync() {
  return useSyncExternalStore(sync.subscribe, sync.get, sync.get);
}

// --- Disparadores automáticos ---
if (typeof window !== "undefined") {
  let t: ReturnType<typeof setTimeout> | undefined;
  store.onLocalChange(() => {
    if (!s.codigo) return;
    clearTimeout(t);
    t = setTimeout(() => void sincronizar(), 1200);
  });
  const alVolver = () => {
    if (document.visibilityState === "visible") void sincronizar();
  };
  window.addEventListener("online", () => void sincronizar());
  window.addEventListener("focus", alVolver);
  document.addEventListener("visibilitychange", alVolver);
  // Mientras la app está abierta, revisa cambios del otro dispositivo cada 20 s
  setInterval(() => {
    if (document.visibilityState === "visible") void sincronizar();
  }, 20000);
  void sincronizar();
}
