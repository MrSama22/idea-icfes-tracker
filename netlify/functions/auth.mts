// Netlify Function: /api/auth/:accion → registro, entrar, salir, yo, clave, olvide, restablecer.
import type { Config, Context } from "@netlify/functions";
import { almacenBlobs } from "../shared/almacen-blobs.ts";
import { manejarAuth } from "../shared/api-auth.ts";

export default async (req: Request, context: Context) =>
  manejarAuth(req, String(context.params.accion ?? ""), almacenBlobs());

export const config: Config = { path: "/api/auth/:accion" };
