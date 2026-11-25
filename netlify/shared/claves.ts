// Claves de IA por cuenta: cada usuario normal usa las suyas; el administrador usa las del servidor.
// Una cuenta puede guardar VARIAS claves (de proveedores distintos o repetidas del mismo): cuando
// una llega a su tope gratuito, la app pasa sola a la siguiente. Nada se devuelve al navegador.
import type { Almacen } from "./almacen.ts";
import type { Rol } from "./auth.ts";

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

/** Proveedores que se reconocen por el prefijo de la clave. */
const PREFIJOS: RegExp[] = [
  /^sk-or-[A-Za-z0-9_-]{16,}$/, // OpenRouter
  /^gsk_[A-Za-z0-9_-]{16,}$/, // Groq
  /^mstrl_[A-Za-z0-9_-]{16,}$/, // Mistral
  /^nvapi-[A-Za-z0-9_-]{16,}$/, // NVIDIA NIM
  /^csk-[A-Za-z0-9_-]{16,}$/, // Cerebras
  /^AIza[A-Za-z0-9_-]{20,}$/, // Google AI Studio (formato viejo)
  /^AQ\.[A-Za-z0-9_.-]{20,}$/, // Google AI Studio (2026)
  /^sk-[A-Za-z0-9_-]{20,}$/, // OpenAI
];

/** «proveedor:clave»: se puede usar con cualquiera, y hace falta si la clave no trae prefijo propio. */
const CON_PROVEEDOR = /^(openai|google|gemini|openrouter|groq|mistral|nvidia|cerebras):/i;
const PROVEEDORES = ["openai", "google", "gemini", "openrouter", "groq", "mistral", "nvidia", "cerebras"];

const MAX_CLAVES = 10;

export function claveValida(clave: string) {
  const t = String(clave ?? "").trim();
  const m = t.match(CON_PROVEEDOR);
  if (m) return t.length - m[0].length >= 16;
  return PREFIJOS.some((re) => re.test(t));
}

/** Separa el texto pegado (una clave por línea, o separadas por comas) y deja solo las válidas. */
export function normalizarClaves(texto: unknown): string[] {
  const trozos = String(texto ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const salida: string[] = [];
  const vistas = new Set<string>();
  for (const t of trozos) {
    if (!claveValida(t)) continue;
    // Se guarda tal cual (con «proveedor:» si lo traía) para saber a quién pertenece.
    const limpia = t.replace(CON_PROVEEDOR, (p) => (p.toLowerCase() === "gemini:" ? "" : p.toLowerCase()));
    if (vistas.has(limpia)) continue;
    vistas.add(limpia);
    salida.push(limpia);
    if (salida.length >= MAX_CLAVES) break;
  }
  return salida;
}

/** Lo que se recibió del formulario: las buenas y las que no se reconocieron (para avisar). */
export function revisarClaves(texto: unknown): { claves: string[]; invalidas: string[] } {
  const trozos = String(texto ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    claves: normalizarClaves(texto),
    invalidas: trozos.filter((t) => !claveValida(t)),
  };
}

/** Claves guardadas por la cuenta (acepta el formato viejo de una sola clave). */
export async function leerClaves(a: Almacen, uid: string): Promise<string[]> {
  const g = await a.get<{ claves?: string[]; clave?: string }>(`k/${uid}`);
  const lista = Array.isArray(g?.claves) ? g!.claves : g?.clave ? [g.clave] : [];
  return lista.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

/** Variables del servidor donde el dueño puede dejar sus claves (admite varias separadas por comas). */
const ENV_CLAVES = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "NVIDIA_API_KEY",
  "CEREBRAS_API_KEY",
];

/** Claves del servidor, en orden. Las de proveedores sin prefijo se marcan con «proveedor:». */
export function clavesServidor(): string[] {
  const salida: string[] = [];
  for (const nombre of ENV_CLAVES) {
    const valor = String(env(nombre) ?? "").trim();
    if (!valor) continue;
    const prov = nombre.replace(/_API_KEY$/, "").toLowerCase();
    const prefijo = prov === "gemini" ? "google" : prov;
    for (const parte of valor.split(/[\s,;]+/).filter(Boolean)) {
      if (!PROVEEDORES.includes(prov) && parte.length < 16) continue;
      salida.push(claveValida(parte) ? normalizarClaves(parte)[0] ?? parte : `${prefijo}:${parte}`);
    }
  }
  return [...new Set(salida.filter(Boolean))];
}

/** ¿El servidor tiene alguna clave propia (la del dueño)? Solo la puede usar el administrador. */
export const claveServidor = () => clavesServidor().length > 0;

/** Las claves que corresponden a esta cuenta: las suyas o, si es admin, las del servidor. */
export async function resolver(
  a: Almacen,
  u: { id: string; rol: Rol },
): Promise<{ claves: string[]; servidor: boolean }> {
  const propias = await leerClaves(a, u.id);
  if (propias.length) return { claves: propias, servidor: false };
  if (u.rol === "admin") {
    const servidor = clavesServidor();
    if (servidor.length) return { claves: servidor, servidor: true };
  }
  return { claves: [], servidor: false };
}
