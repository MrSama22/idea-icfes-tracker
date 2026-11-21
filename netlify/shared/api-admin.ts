// Panel del administrador: ver cuentas y generar una contraseña temporal.
import type { Almacen } from "./almacen.ts";
import { asegurarAdmin, buscar, cambiarClave, normalizar, publica, sesionDe } from "./auth.ts";
import { error, json } from "./respuesta.ts";

export async function manejarAdmin(req: Request, accion: string, a: Almacen): Promise<Response> {
  await asegurarAdmin(a);
  const u = await sesionDe(a, req);
  if (!u) return error("Entra a tu cuenta primero.", 401);
  if (u.rol !== "admin") return error("Solo el administrador puede hacer esto.", 403);

  if (req.method === "GET" && accion === "usuarios") {
    const claves = await a.claves("u/");
    const cuentas = [];
    for (const k of claves) {
      const x = await a.get<Parameters<typeof publica>[0]>(k);
      if (x) cuentas.push({ ...publica(x), creado: x.creado });
    }
    cuentas.sort((x, y) => y.creado - x.creado);
    return json(cuentas);
  }

  if (req.method === "POST" && accion === "clave") {
    let email = "";
    try {
      email = normalizar(String(((await req.json()) as { email?: string }).email ?? ""));
    } catch {
      return error("Datos inválidos.");
    }
    if (!(await buscar(a, email))) return error("Esa cuenta no existe.", 404);
    const alfabeto = "abcdefghjkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const temporal = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
    await cambiarClave(a, email, temporal);
    return json({ email, clave: temporal });
  }

  return error("Método no permitido", 405);
}
