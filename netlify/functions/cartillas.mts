// Cartillas subidas por el estudiante, compartidas entre sus dispositivos con el código de sincronización.
// GET    /api/cartillas/:codigo        → [{id, nombre, materia, preguntas, creado}]
// GET    /api/cartillas/:codigo/:id    → cartilla completa
// PUT    /api/cartillas/:codigo/:id    → guarda
// DELETE /api/cartillas/:codigo/:id    → borra
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req: Request, context: Context) => {
  const codigo = String(context.params.codigo ?? "").toUpperCase();
  const id = context.params.id ? String(context.params.id) : null;
  if (!/^[A-Z0-9]{12}$/.test(codigo)) return json({ error: "Código inválido" }, 400);
  if (id !== null && !/^[a-z0-9]{6,40}$/.test(id)) return json({ error: "Id inválido" }, 400);
  const blobs = getStore({ name: "cartillas", consistency: "strong" });
  const indiceKey = `${codigo}/_indice`;
  const indice = ((await blobs.get(indiceKey, { type: "json" })) as any[] | null) ?? [];

  if (!id) return req.method === "GET" ? json(indice) : json({ error: "Método no permitido" }, 405);

  if (req.method === "GET") {
    const c = await blobs.get(`${codigo}/${id}`, { type: "json" });
    return c ? json(c) : json({ error: "No existe" }, 404);
  }
  if (req.method === "DELETE") {
    await blobs.delete(`${codigo}/${id}`);
    await blobs.setJSON(indiceKey, indice.filter((x) => x.id !== id));
    return json({ ok: true });
  }
  if (req.method === "PUT") {
    const texto = await req.text();
    if (texto.length > 5_800_000) return json({ error: "Demasiado grande" }, 413);
    let c: any;
    try {
      c = JSON.parse(texto);
      if (c.id !== id || !Array.isArray(c.unidades)) throw 0;
    } catch {
      return json({ error: "Datos inválidos" }, 400);
    }
    await blobs.set(`${codigo}/${id}`, texto);
    const resumen = {
      id,
      nombre: String(c.nombre ?? "Cartilla").slice(0, 120),
      materia: c.materia ?? null,
      preguntas: c.unidades.reduce((a: number, u: any) => a + (u.preguntas?.length ?? 0), 0),
      creado: c.creado ?? Date.now(),
    };
    await blobs.setJSON(indiceKey, [...indice.filter((x) => x.id !== id), resumen]);
    return json(resumen);
  }
  return json({ error: "Método no permitido" }, 405);
};

export const config: Config = { path: ["/api/cartillas/:codigo", "/api/cartillas/:codigo/:id"], method: ["GET", "PUT", "DELETE"] };
