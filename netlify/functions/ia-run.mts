// Ejecuta en segundo plano (hasta 15 min) un trabajo de IA guardado por /api/ia/:job.
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { almacenBlobs } from "../shared/almacen-blobs.ts";
import { resolver } from "../shared/claves.ts";
import { ejecutar } from "../shared/ia.ts";

export default async (req: Request) => {
  const { job } = (await req.json()) as { job: string };
  const blobs = getStore({ name: "ia", consistency: "strong" });
  const entrada = await blobs.get<any>(`in/${job}`, { type: "json" });
  if (!entrada) return;
  try {
    const { clave } = await resolver(almacenBlobs(), { id: String(entrada.uid), rol: entrada.rol });
    if (!clave) throw new Error("La cuenta no tiene clave de IA configurada.");
    const resultado = await ejecutar(entrada, clave);
    await blobs.setJSON(`out/${job}`, { estado: "listo", resultado });
  } catch (err) {
    await blobs.setJSON(`out/${job}`, { estado: "error", error: String((err as Error)?.message ?? err).slice(0, 300) });
  }
  await blobs.delete(`in/${job}`);
  await blobs.delete(`d/${job}`);
};

export const config: Config = { background: true, path: "/api/ia-run" };
