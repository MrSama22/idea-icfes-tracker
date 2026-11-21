// Solo desarrollo local: imita las funciones de Netlify /api/ia y /api/cartillas en memoria.
import type { Hono } from "hono";
import { ejecutar } from "../../../../netlify/shared/ia.ts";

const trabajos = new Map<string, any>();
const cartillas = new Map<string, Map<string, any>>();

export function devShim(app: Hono<any>) {
  app.post("/api/ia/:job", async (c) => {
    const job = c.req.param("job");
    const e = await c.req.json();
    if (!trabajos.has(job)) {
      trabajos.set(job, { estado: "pendiente" });
      ejecutar(e)
        .then((resultado) => trabajos.set(job, { estado: "listo", resultado }))
        .catch((err) => trabajos.set(job, { estado: "error", error: String(err?.message ?? err).slice(0, 300) }));
    }
    return c.json({ estado: "pendiente" }, 202);
  });
  app.get("/api/ia/:job", (c) => c.json(trabajos.get(c.req.param("job")) ?? { estado: "error", error: "No existe" }));
  const de = (k: string) => cartillas.get(k) ?? cartillas.set(k, new Map()).get(k)!;
  app.get("/api/cartillas/:codigo", (c) =>
    c.json([...de(c.req.param("codigo")).values()].map((x) => ({ id: x.id, nombre: x.nombre, materia: x.materia, preguntas: 0, creado: x.creado }))),
  );
  app.get("/api/cartillas/:codigo/:id", (c) => {
    const x = de(c.req.param("codigo")).get(c.req.param("id"));
    return x ? c.json(x) : c.json({ error: "No existe" }, 404);
  });
  app.put("/api/cartillas/:codigo/:id", async (c) => {
    de(c.req.param("codigo")).set(c.req.param("id"), await c.req.json());
    return c.json({ ok: true });
  });
  app.delete("/api/cartillas/:codigo/:id", (c) => {
    de(c.req.param("codigo")).delete(c.req.param("id"));
    return c.json({ ok: true });
  });
}
