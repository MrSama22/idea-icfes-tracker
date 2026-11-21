// Cartillas: cada cuenta ve las suyas; el administrador publica cartillas para todas las cuentas.
// GET    /api/cartillas          → índice de mi cuenta
// GET    /api/cartillas/:id      → cartilla completa
// PUT    /api/cartillas/:id      → guardar
// DELETE /api/cartillas/:id      → borrar
// GET    /api/global             → índice de cartillas globales (cualquier cuenta)
// PUT/DELETE /api/global/:id     → solo administrador
import type { Almacen } from "./almacen.ts";
import { sesionDe, type Usuario } from "./auth.ts";
import { error, json } from "./respuesta.ts";

const MAX_BYTES = 5_800_000;
const ID_VALIDO = /^[a-z0-9]{6,40}$/;

interface Resumen {
  id: string;
  nombre: string;
  materia: string | null;
  preguntas: number;
  creado: number;
}

function resumir(id: string, c: any): Resumen {
  return {
    id,
    nombre: String(c?.nombre ?? "Cartilla").slice(0, 120),
    materia: c?.materia ?? null,
    preguntas: Array.isArray(c?.unidades)
      ? c.unidades.reduce((a: number, u: any) => a + (u.preguntas?.length ?? 0), 0)
      : 0,
    creado: Number(c?.creado) || Date.now(),
  };
}

export async function manejarCartillas(
  req: Request,
  opciones: { almacen: Almacen; id: string | null; global: boolean },
): Promise<Response> {
  const { almacen: a, id, global } = opciones;
  const usuario: Usuario | null = await sesionDe(a, req);
  if (!usuario) return error("Entra a tu cuenta para guardar y ver cartillas.", 401);

  const base = global ? "g" : `c/${usuario.id}`;
  const indiceKey = `${base}/_indice`;

  if (!id) {
    if (req.method !== "GET") return error("Método no permitido", 405);
    return json(((await a.get<Resumen[]>(indiceKey)) ?? []).sort((x, y) => y.creado - x.creado));
  }

  if (!ID_VALIDO.test(id)) return error("Id inválido");

  const clave = `${base}/${id}`;

  if (req.method === "GET") {
    const c = await a.get(clave);
    return c ? json(c) : error("No existe", 404);
  }

  if (global && usuario.rol !== "admin") return error("Solo el administrador puede cambiar las globales.", 403);

  if (req.method === "DELETE") {
    await a.del(clave);
    const indice = (await a.get<Resumen[]>(indiceKey)) ?? [];
    await a.set(indiceKey, indice.filter((x) => x.id !== id));
    return json({ ok: true });
  }

  if (req.method === "PUT") {
    const texto = await req.text();
    if (texto.length > MAX_BYTES) return error("La cartilla es demasiado grande para la nube.", 413);
    let c: any;
    try {
      c = JSON.parse(texto);
      if (c.id !== id || !Array.isArray(c.unidades)) throw 0;
    } catch {
      return error("Datos inválidos");
    }
    await a.set(clave, c);
    const indice = (await a.get<Resumen[]>(indiceKey)) ?? [];
    const resumen = resumir(id, c);
    await a.set(indiceKey, [...indice.filter((x) => x.id !== id), resumen]);
    return json(resumen);
  }

  return error("Método no permitido", 405);
}
