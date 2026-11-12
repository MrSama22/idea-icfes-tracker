// Netlify Function: guarda y mezcla los datos de un "código de sincronización".
// GET  /api/sync/:codigo → datos guardados (404 si el código no existe)
// PUT  /api/sync/:codigo → mezcla lo enviado con lo guardado y devuelve el resultado
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { mergeDB, type DB } from "../../packages/web/src/web/lib/merge.ts";

const MAX_BYTES = 4 * 1024 * 1024;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req: Request, context: Context) => {
  const codigo = String(context.params.codigo ?? "").toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(codigo)) return json({ error: "Código inválido" }, 400);

  const blobs = getStore({ name: "sync", consistency: "strong" });
  const actual = (await blobs.get(codigo, { type: "json" })) as DB | null;

  if (req.method === "GET") {
    return actual ? json(actual) : json({ error: "No existe" }, 404);
  }

  if (req.method === "PUT") {
    const texto = await req.text();
    if (texto.length > MAX_BYTES) return json({ error: "Demasiado grande" }, 413);
    let entrante: DB;
    try {
      entrante = JSON.parse(texto) as DB;
      if (!Array.isArray(entrante.simulacros) || !Array.isArray(entrante.errores)) throw 0;
    } catch {
      return json({ error: "Datos inválidos" }, 400);
    }
    const mezcla = mergeDB(actual, entrante);
    await blobs.setJSON(codigo, mezcla);
    return json(mezcla);
  }

  return json({ error: "Método no permitido" }, 405);
};

export const config: Config = {
  path: "/api/sync/:codigo",
  method: ["GET", "PUT"],
};
