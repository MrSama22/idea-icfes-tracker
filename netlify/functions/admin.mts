// Netlify Function: /api/admin/:accion → lista de cuentas y contraseña temporal.
import type { Config, Context } from "@netlify/functions";
import { almacenBlobs } from "../shared/almacen-blobs.ts";
import { manejarAdmin } from "../shared/api-admin.ts";

export default async (req: Request, context: Context) =>
  manejarAdmin(req, String(context.params.accion ?? ""), almacenBlobs());

export const config: Config = { path: "/api/admin/:accion" };
