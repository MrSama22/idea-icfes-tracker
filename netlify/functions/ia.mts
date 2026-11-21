// Trabajos de IA para convertir cartillas subidas en preguntas.
// POST /api/ia/:job  {tipo:"extraer"|"explicar", ...}  → guarda la entrada y lanza el trabajo en segundo plano
// GET  /api/ia/:job                                     → {estado:"pendiente"|"listo"|"error", resultado?, error?}
// Cada cuenta usa su propia clave de IA; el administrador puede usar la del servidor.
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { almacenBlobs } from "../shared/almacen-blobs.ts";
import { sesionDe } from "../shared/auth.ts";
import { claveServidor, leerClave, resolver } from "../shared/claves.ts";

const LIMITE_DIARIO = 1500; // freno simple contra abuso
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const SIN_CLAVE = "Añade tu clave de OpenAI en «Mis cartillas» para poder subir cartillas.";

export default async (req: Request, context: Context) => {
  const job = String(context.params.job ?? "");
  const almacen = almacenBlobs();
  const usuario = await sesionDe(almacen, req);

  if (job === "estado") {
    const propia = usuario ? Boolean(await leerClave(almacen, usuario.id)) : false;
    const servidor = Boolean(usuario?.rol === "admin" && claveServidor());
    return json({ configurada: claveServidor(), propia, servidor, puede: propia || servidor });
  }

  if (!/^[a-zA-Z0-9_-]{10,64}$/.test(job)) return json({ error: "Trabajo inválido" }, 400);
  if (!usuario) return json({ error: "Entra a tu cuenta para leer cartillas." }, 401);
  const blobs = getStore({ name: "ia", consistency: "strong" });

  const dueno = await blobs.get(`d/${job}`);
  if (dueno && dueno !== usuario.id) return json({ error: "No autorizado" }, 403);

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

  const clave = await resolver(almacen, usuario);
  if (!clave.clave && !clave.servidor) return json({ error: SIN_CLAVE }, 402);

  const dia = new Date().toISOString().slice(0, 10);
  const n = Number((await blobs.get(`cupo/${dia}`)) ?? 0);
  if (n >= LIMITE_DIARIO) return json({ error: "Se alcanzó el límite de hoy. Intenta mañana." }, 429);
  await blobs.set(`cupo/${dia}`, String(n + 1));
  if (await blobs.get(`out/${job}`)) return json({ estado: "pendiente" }, 202);
  // Solo el identificador de la cuenta: la clave se lee de nuevo al ejecutar el trabajo.
  await blobs.setJSON(`in/${job}`, { ...entrada, uid: usuario.id, rol: usuario.rol });
  await blobs.set(`d/${job}`, usuario.id);
  const r = await fetch(new URL("/api/ia-run", req.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job }),
  });
  if (r.status >= 300) return json({ error: `No se pudo iniciar (${r.status})` }, 502);
  return json({ estado: "pendiente" }, 202);
};

export const config: Config = { path: "/api/ia/:job", method: ["GET", "POST"] };
