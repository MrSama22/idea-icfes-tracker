// Estado de la cuenta en el navegador: sesión en cookie HttpOnly, estado en memoria.
import { useSyncExternalStore } from "react";

export interface Cuenta {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "usuario";
}

interface Estado {
  cuenta: Cuenta | null;
  listo: boolean;
}

let estado: Estado = { cuenta: null, listo: false };
const subs = new Set<() => void>();

function set(e: Partial<Estado>) {
  estado = { ...estado, ...e };
  subs.forEach((f) => f());
}

async function pedir<T>(ruta: string, cuerpo?: unknown, metodo?: string): Promise<T> {
  const res = await fetch(ruta, {
    method: metodo ?? (cuerpo === undefined ? "GET" : "POST"),
    headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((datos as { error?: string })?.error ?? "No se pudo completar la operación.");
  return datos as T;
}

/** Las cartillas se recargan solas cuando cambia la cuenta. */
async function avisarCartillas() {
  try {
    const m = await import("./cartillas");
    if (estado.cuenta) await m.sincronizarCartillas();
    else await m.cerrarCuenta();
  } catch {
    /* sin efecto */
  }
}

export const auth = {
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
  get: () => estado,
  async refrescar() {
    try {
      const d = await pedir<{ cuenta: Cuenta | null }>("/api/auth/yo");
      set({ cuenta: d.cuenta ?? null, listo: true });
    } catch {
      set({ cuenta: null, listo: true });
    }
  },
  async entrar(email: string, clave: string) {
    const d = await pedir<{ cuenta: Cuenta }>("/api/auth/entrar", { email, clave });
    set({ cuenta: d.cuenta, listo: true });
    await avisarCartillas();
    return d.cuenta;
  },
  async registrar(email: string, clave: string, nombre: string) {
    const d = await pedir<{ cuenta: Cuenta }>("/api/auth/registro", { email, clave, nombre });
    set({ cuenta: d.cuenta, listo: true });
    await avisarCartillas();
    return d.cuenta;
  },
  async salir() {
    await pedir("/api/auth/salir", {});
    set({ cuenta: null, listo: true });
    await avisarCartillas();
  },
  async cambiarClave(actual: string, nueva: string) {
    await pedir("/api/auth/clave", { actual, nueva });
  },
  olvide: (email: string) => pedir<{ ok: boolean; enviado: boolean }>("/api/auth/olvide", { email }),
  restablecer: async (email: string, codigo: string, clave: string) => {
    const d = await pedir<{ cuenta: Cuenta }>("/api/auth/restablecer", { email, codigo, clave });
    if (d.cuenta) {
      set({ cuenta: d.cuenta, listo: true });
      await avisarCartillas();
    }
  },
  usuarios: () =>
    pedir<{ id: string; email: string; nombre: string; rol: "admin" | "usuario"; creado: number }[]>(
      "/api/admin/usuarios",
    ),
  claveTemporal: (email: string) => pedir<{ email: string; clave: string }>("/api/admin/clave", { email }),
  estadoClaveIA: () => pedir<{ propia: boolean; claves?: number; servidor: boolean }>("/api/auth/clave-ia"),
  guardarClaveIA: (clave: string) =>
    pedir<{ ok: boolean; propia: boolean; claves?: number; servidor: boolean }>("/api/auth/clave-ia", { clave }, "PUT"),
  borrarClaveIA: () =>
    pedir<{ ok: boolean; propia: boolean; servidor: boolean }>("/api/auth/clave-ia", undefined, "DELETE"),
};

export function useAuth() {
  return useSyncExternalStore(auth.subscribe, auth.get, auth.get);
}

void auth.refrescar();
