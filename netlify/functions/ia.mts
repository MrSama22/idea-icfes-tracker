// Trabajos de IA para convertir cartillas subidas en preguntas.
// POST /api/ia/:job  {tipo:"extraer"|"explicar", ...}  → guarda la entrada y lanza el trabajo en segundo plano
// GET  /api/ia/:job                                     → {estado:"pendiente"|"listo"|"error", resultado?, error?}
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

const LIMITE_DIARIO = 1500; // freno simple contra abuso
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req: Request, context: Context) => {
  const job = String(context.params.job ?? "");
  if (!/^[a-zA-Z0-9_-]{10,64}$/.test(job)) return json({ error: "Trabajo inválido" }, 400);
  const blobs = getStore({ name: "ia", consistency: "strong" });

  if (req.method === "GET") {
    const r = await blobs.get(`out/${job}`, { type: "json" });
    if (r) return json(r);
    const hay = await blobs.getMetadata(`in/${job}`);
    return hay ? json({ estado: "pendiente" }) : json({ estado: "error", error: "No existe" }, 404);
  }

  const texto = await req.text();
  if (texto.length > 5_500_000) return json({ error: "Demasiado grande" }, 413);
  let entrada: any;
  try {
    entrada = JSON.parse(texto);
    if (!["extraer", "explicar"].includes(entrada.tipo)) throw 0;
  } catch {
    return json({ error: "Datos inválidos" }, 400);
  }
  const dia = new Date().toISOString().slice(0, 10);
  const n = Number((await blobs.get(`cupo/${dia}`)) ?? 0);
  if (n >= LIMITE_DIARIO) return json({ error: "Se alcanzó el límite de hoy. Intenta mañana." }, 429);
  await blobs.set(`cupo/${dia}`, String(n + 1));
  if (await blobs.get(`out/${job}`)) return json({ estado: "pendiente" }, 202);
  await blobs.set(`in/${job}`, texto);
  const r = await fetch(new URL("/api/ia-run", req.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job }),
  });
  if (r.status >= 300) return json({ error: `No se pudo iniciar (${r.status})` }, 502);
  return json({ estado: "pendiente" }, 202);
};

export const config: Config = { path: "/api/ia/:job", method: ["GET", "POST"] };
