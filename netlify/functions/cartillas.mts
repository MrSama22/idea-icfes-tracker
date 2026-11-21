// Netlify Function: cartillas de cada cuenta y cartillas globales del administrador.
import type { Config, Context } from "@netlify/functions";
import { almacenBlobs } from "../shared/almacen-blobs.ts";
import { manejarCartillas } from "../shared/api-cartillas.ts";

export default async (req: Request, context: Context) => {
  const ruta = new URL(req.url).pathname;
  return manejarCartillas(req, {
    almacen: almacenBlobs(),
    id: context.params.id ? String(context.params.id) : null,
    global: ruta.startsWith("/api/global"),
  });
};

export const config: Config = {
  path: ["/api/cartillas", "/api/cartillas/:id", "/api/global", "/api/global/:id"],
  method: ["GET", "PUT", "DELETE"],
};
