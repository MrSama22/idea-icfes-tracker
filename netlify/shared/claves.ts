// Claves de IA por cuenta: cada usuario normal usa la suya; el administrador usa la del servidor.
// La clave queda guardada en el almacén del servidor (Netlify Blobs) y nunca se devuelve al navegador.
import type { Almacen } from "./almacen.ts";
import type { Rol } from "./auth.ts";

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

/** ¿El servidor tiene clave propia (la del dueño)? Solo la puede usar el administrador. */
export const claveServidor = () =>
  Boolean(env("OPENAI_API_KEY") || env("GEMINI_API_KEY") || env("AI_GATEWAY_API_KEY"));

// OpenAI (sk-...) o Google AI Studio (AIza... o AQ..., con nivel gratuito).
const FORMATO = /^(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|AQ\.[A-Za-z0-9_.-]{20,})$/;
export const claveValida = (clave: string) => FORMATO.test(String(clave ?? "").trim());

export async function leerClave(a: Almacen, uid: string): Promise<string | null> {
  const g = await a.get<{ clave: string }>(`k/${uid}`);
  return g?.clave ?? null;
}

/** La llave que corresponde a esta cuenta: la suya o, si es admin, la del servidor. */
export async function resolver(a: Almacen, u: { id: string; rol: Rol }): Promise<{ clave: string | null; servidor: boolean }> {
  const propia = await leerClave(a, u.id);
  if (propia) return { clave: propia, servidor: false };
  if (u.rol === "admin") {
    const k = env("OPENAI_API_KEY") ?? env("GEMINI_API_KEY");
    if (k) return { clave: k, servidor: true };
    if (env("AI_GATEWAY_API_KEY")) return { clave: null, servidor: true };
  }
  return { clave: null, servidor: false };
}
