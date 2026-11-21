// Cuentas locales: correo + contraseña cifrada con PBKDF2-SHA256 y sesión en cookie HttpOnly.
// Nada de esto depende de un proveedor externo: se guarda en Netlify Blobs (o memoria en desarrollo).
import type { Almacen } from "./almacen.ts";

export type Rol = "admin" | "usuario";

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  salt: string;
  hash: string;
  creado: number;
}

/** Lo que sí puede viajar al navegador. */
export type Cuenta = Pick<Usuario, "id" | "email" | "nombre" | "rol">;

export const COOKIE = "idea_cuenta";
export const DIAS_SESION = 30;

const ITERACIONES = 120_000;

const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const aleatorio = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export const normalizar = (email: string) => String(email ?? "").trim().toLowerCase();
export const emailValido = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

export async function derivar(clave: string, salt: string) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: ITERACIONES, hash: "SHA-256" },
    base,
    256,
  );
  return b64url(new Uint8Array(bits));
}

export const publica = (u: Usuario): Cuenta => ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol });

export const buscar = (a: Almacen, email: string) => a.get<Usuario>(`u/${normalizar(email)}`);

export async function crearUsuario(
  a: Almacen,
  input: { email: string; clave: string; nombre?: string; rol?: Rol },
): Promise<Usuario> {
  const email = normalizar(input.email);
  if (!emailValido(email)) throw new Error("Escribe un correo válido.");
  if (String(input.clave ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  if (await buscar(a, email)) throw new Error("Ya existe una cuenta con ese correo.");
  const salt = aleatorio(16);
  const usuario: Usuario = {
    id: aleatorio(12),
    email,
    nombre: (input.nombre ?? "").trim() || email.split("@")[0],
    rol: input.rol ?? "usuario",
    salt,
    hash: await derivar(input.clave, salt),
    creado: Date.now(),
  };
  await a.set(`u/${email}`, usuario);
  return usuario;
}

export async function verificar(a: Almacen, email: string, clave: string): Promise<Usuario | null> {
  const u = await buscar(a, email);
  if (!u) return null;
  return (await derivar(String(clave ?? ""), u.salt)) === u.hash ? u : null;
}

export async function cambiarClave(a: Almacen, email: string, clave: string) {
  const u = await buscar(a, email);
  if (!u) throw new Error("Esa cuenta no existe.");
  if (String(clave ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  const salt = aleatorio(16);
  await a.set(`u/${normalizar(email)}`, { ...u, salt, hash: await derivar(clave, salt) });
}

// ---------- sesiones ----------
export async function abrirSesion(a: Almacen, usuario: Usuario) {
  const token = aleatorio(32);
  await a.set(`s/${token}`, { email: usuario.email, exp: Date.now() + DIAS_SESION * 86400_000 });
  return token;
}

export async function sesionDe(a: Almacen, req: Request): Promise<Usuario | null> {
  const token = leerCookie(req, COOKIE);
  if (!token) return null;
  const s = await a.get<{ email: string; exp: number }>(`s/${token}`);
  if (!s || s.exp < Date.now()) return null;
  return buscar(a, s.email);
}

export async function cerrarSesion(a: Almacen, req: Request) {
  const token = leerCookie(req, COOKIE);
  if (token) await a.del(`s/${token}`);
}

export function leerCookie(req: Request, nombre: string): string | null {
  for (const parte of (req.headers.get("cookie") ?? "").split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

export const esSeguro = (req: Request) => new URL(req.url).protocol === "https:";

export const cookieSesion = (token: string, secure: boolean) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DIAS_SESION * 86400}${secure ? "; Secure" : ""}`;

export const cookieFuera = (secure: boolean) =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

// ---------- administrador inicial ----------
let sembrado: Promise<void> | null = null;

/**
 * Crea el usuario administrador la primera vez, con las variables de entorno
 * ADMIN_EMAIL y ADMIN_PASSWORD (en Netlify: Site settings → Environment variables).
 */
export function asegurarAdmin(a: Almacen): Promise<void> {
  if (!sembrado) {
    sembrado = (async () => {
      const email = normalizar(process.env.ADMIN_EMAIL ?? "");
      const clave = process.env.ADMIN_PASSWORD ?? "";
      if (!emailValido(email) || !clave) return;
      const u = await buscar(a, email);
      if (!u) {
        await crearUsuario(a, {
          email,
          clave,
          nombre: process.env.ADMIN_NOMBRE ?? "Administrador",
          rol: "admin",
        });
        return;
      }
      if (u.rol !== "admin") await a.set(`u/${email}`, { ...u, rol: "admin" });
    })().catch((e) => {
      sembrado = null;
      console.error("[auth] no se pudo preparar el administrador:", e);
    });
  }
  return sembrado;
}
