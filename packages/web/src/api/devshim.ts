// Solo desarrollo local: imita las funciones de Netlify en memoria.
// Cuentas, sesiones, cartillas por usuario y globales usan la misma lógica que producción.
import type { Hono } from "hono";
import { ejecutar } from "../../../../netlify/shared/ia.ts";
import { sesionDe } from "../../../../netlify/shared/auth.ts";
import { claveServidor, leerClaves, resolver } from "../../../../netlify/shared/claves.ts";
import { almacenMemoria } from "../../../../netlify/shared/almacen.ts";
import { manejarAuth } from "../../../../netlify/shared/api-auth.ts";
import { manejarAdmin } from "../../../../netlify/shared/api-admin.ts";
import { manejarCartillas } from "../../../../netlify/shared/api-cartillas.ts";

const trabajos = new Map<string, any>();
const SIN_CLAVE =
  "Añade tu clave de IA en «Mis cartillas» (una gratis de Gemini, Groq, OpenRouter o Mistral) para poder subir cartillas.";

export function devShim(app: Hono<any>) {
  const almacen = almacenMemoria();

  app.get("/api/ia/estado", async (c) => {
    const u = await sesionDe(almacen, c.req.raw);
    const claves = u ? (await leerClaves(almacen, u.id)).length : 0;
    const servidor = Boolean(u?.rol === "admin" && claveServidor());
    return c.json({ configurada: claveServidor(), propia: claves > 0, claves, servidor, puede: claves > 0 || servidor });
  });

  app.post("/api/ia/:job", async (c) => {
    const u = await sesionDe(almacen, c.req.raw);
    if (!u) return c.json({ error: "Entra a tu cuenta para leer cartillas." }, 401);
    const job = c.req.param("job");
    const previo = trabajos.get(job);
    if (previo && previo.uid !== u.id) return c.json({ error: "No autorizado" }, 403);
    const { claves } = await resolver(almacen, u);
    if (!claves.length) return c.json({ error: SIN_CLAVE }, 402);
    const e = await c.req.json();
    if (!trabajos.has(job)) {
      trabajos.set(job, { estado: "pendiente", uid: u.id });
      ejecutar(e, claves)
        .then((resultado) => trabajos.set(job, { estado: "listo", resultado, uid: u.id }))
        .catch((err) => trabajos.set(job, { estado: "error", error: String(err?.message ?? err).slice(0, 300), uid: u.id }));
    }
    return c.json({ estado: "pendiente" }, 202);
  });

  app.get("/api/ia/:job", async (c) => {
    const u = await sesionDe(almacen, c.req.raw);
    if (!u) return c.json({ error: "Entra a tu cuenta para leer cartillas." }, 401);
    const t = trabajos.get(c.req.param("job"));
    if (t?.uid && t.uid !== u.id) return c.json({ error: "No autorizado" }, 403);
    if (!t) return c.json({ estado: "error", error: "No existe" });
    return c.json({ estado: t.estado, resultado: t.resultado, error: t.error });
  });

  app.all("/api/auth/:accion", (c) => manejarAuth(c.req.raw, c.req.param("accion"), almacen));
  app.all("/api/admin/:accion", (c) => manejarAdmin(c.req.raw, c.req.param("accion"), almacen));
  app.all("/api/cartillas", (c) => manejarCartillas(c.req.raw, { almacen, id: null, global: false }));
  app.all("/api/cartillas/:id", (c) =>
    manejarCartillas(c.req.raw, { almacen, id: c.req.param("id"), global: false }),
  );
  app.all("/api/global", (c) => manejarCartillas(c.req.raw, { almacen, id: null, global: true }));
  app.all("/api/global/:id", (c) =>
    manejarCartillas(c.req.raw, { almacen, id: c.req.param("id"), global: true }),
  );
}
