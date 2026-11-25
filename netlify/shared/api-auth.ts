// Rutas de cuenta: registro, entrar, salir, sesión actual, cambiar/recuperar contraseña.
import type { Almacen } from "./almacen.ts";
import {
  abrirSesion,
  asegurarAdmin,
  buscar,
  cambiarClave,
  cerrarSesion,
  cookieFuera,
  cookieSesion,
  crearUsuario,
  derivar,
  emailValido,
  esSeguro,
  normalizar,
  publica,
  sesionDe,
  verificar,
} from "./auth.ts";
import { claveServidor, claveValida, leerClave } from "./claves.ts";
import { correoConfigurado, enviarCodigo } from "./correo.ts";
import { error, json } from "./respuesta.ts";

const MAX_INTENTOS = 8;
const BLOQUEO_MIN = 15;
const VIGENCIA_CODIGO_MIN = 30;

const cuerpo = async (req: Request) => {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
};

const texto = (v: unknown) => String(v ?? "").trim();

async function castigar(a: Almacen, email: string) {
  const k = `i/${email}`;
  const prev = (await a.get<{ n: number; hasta: number }>(k)) ?? { n: 0, hasta: 0 };
  const n = prev.n + 1;
  await a.set(k, { n, hasta: n >= MAX_INTENTOS ? Date.now() + BLOQUEO_MIN * 60_000 : 0 });
  if (n < MAX_INTENTOS) return;
  await a.set(k, { n: 0, hasta: Date.now() + BLOQUEO_MIN * 60_000 });
}

export async function manejarAuth(req: Request, accion: string, a: Almacen): Promise<Response> {
  await asegurarAdmin(a);
  const seguro = esSeguro(req);
  const ruta = `${req.method} ${accion}`;

  try {
    if (ruta === "GET yo") {
      const u = await sesionDe(a, req);
      return json({ cuenta: u ? publica(u) : null });
    }

    if (ruta === "POST registro") {
      const d = await cuerpo(req);
      const email = normalizar(texto(d.email));
      const u = await crearUsuario(a, {
        email,
        clave: String(d.clave ?? ""),
        nombre: texto(d.nombre),
      });
      const token = await abrirSesion(a, u);
      return json({ cuenta: publica(u) }, 200, { "set-cookie": cookieSesion(token, seguro) });
    }

    if (ruta === "POST entrar") {
      const d = await cuerpo(req);
      const email = normalizar(texto(d.email));
      if (!emailValido(email)) return error("Escribe un correo válido.");
      const castigo = await a.get<{ n: number; hasta: number }>(`i/${email}`);
      if (castigo?.hasta && castigo.hasta > Date.now()) {
        return error("Demasiados intentos. Espera unos minutos e inténtalo otra vez.", 429);
      }
      const u = await verificar(a, email, String(d.clave ?? ""));
      if (!u) {
        await castigar(a, email);
        return error("Correo o contraseña incorrectos.", 401);
      }
      await a.del(`i/${email}`);
      const token = await abrirSesion(a, u);
      return json({ cuenta: publica(u) }, 200, { "set-cookie": cookieSesion(token, seguro) });
    }

    if (ruta === "POST salir") {
      await cerrarSesion(a, req);
      return json({ ok: true }, 200, { "set-cookie": cookieFuera(seguro) });
    }

    if (ruta === "POST clave") {
      const u = await sesionDe(a, req);
      if (!u) return error("Entra a tu cuenta primero.", 401);
      const d = await cuerpo(req);
      if (!(await verificar(a, u.email, String(d.actual ?? "")))) return error("Tu contraseña actual no coincide.");
      await cambiarClave(a, u.email, String(d.nueva ?? ""));
      return json({ ok: true });
    }

    // Clave de IA propia de la cuenta (las normales no usan la del servidor).
    if (ruta === "GET clave-ia") {
      const u = await sesionDe(a, req);
      if (!u) return json({ propia: false, servidor: false });
      return json({ propia: Boolean(await leerClave(a, u.id)), servidor: u.rol === "admin" && claveServidor() });
    }

    if (ruta === "PUT clave-ia") {
      const u = await sesionDe(a, req);
      if (!u) return error("Entra a tu cuenta primero.", 401);
      const d = await cuerpo(req);
      const clave = texto(d.clave);
      if (!claveValida(clave))
        return error(
          "Esa clave no parece válida: debe ser de OpenAI (empieza por sk-), de OpenRouter (empieza por sk-or-) o de Google AI Studio (empieza por AIza o por AQ.).",
        );
      await a.set(`k/${u.id}`, { clave, creado: Date.now() });
      return json({ ok: true, propia: true, servidor: u.rol === "admin" && claveServidor() });
    }

    if (ruta === "DELETE clave-ia") {
      const u = await sesionDe(a, req);
      if (!u) return error("Entra a tu cuenta primero.", 401);
      await a.del(`k/${u.id}`);
      return json({ ok: true, propia: false, servidor: u.rol === "admin" && claveServidor() });
    }

    if (ruta === "POST olvide") {
      const d = await cuerpo(req);
      const email = normalizar(texto(d.email));
      if (!emailValido(email)) return error("Escribe un correo válido.");
      const u = await buscar(a, email);
      // Si la cuenta no existe respondemos igual, para no revelar quién está registrado.
      if (!u) return json({ ok: true, enviado: correoConfigurado() });
      const codigo = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => String(b % 10)).join("");
      const salt = u.salt;
      await a.set(`r/${email}`, {
        salt,
        hash: await derivar(codigo, salt),
        exp: Date.now() + VIGENCIA_CODIGO_MIN * 60_000,
      });
      const enviado = await enviarCodigo(email, codigo);
      return json({ ok: true, enviado });
    }

    if (ruta === "POST restablecer") {
      const d = await cuerpo(req);
      const email = normalizar(texto(d.email));
      const codigo = texto(d.codigo);
      const guardado = await a.get<{ salt: string; hash: string; exp: number }>(`r/${email}`);
      if (!guardado || guardado.exp < Date.now()) return error("Ese código ya venció. Pide uno nuevo.");
      if ((await derivar(codigo, guardado.salt)) !== guardado.hash) return error("El código no es correcto.");
      await cambiarClave(a, email, String(d.clave ?? ""));
      await a.del(`r/${email}`);
      const u = await buscar(a, email);
      if (!u) return json({ ok: true });
      const token = await abrirSesion(a, u);
      return json({ cuenta: publica(u) }, 200, { "set-cookie": cookieSesion(token, seguro) });
    }

    return error("Método no permitido", 405);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Algo salió mal.";
    return error(mensaje, 400);
  }
}
