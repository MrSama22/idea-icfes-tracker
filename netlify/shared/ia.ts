// Núcleo de los trabajos de IA (lo usan la función de Netlify y el servidor local de desarrollo).
import { createGateway, generateText } from "ai";
import { SYS_EXPLICAR, SYS_EXTRAER, promptExplicar, promptExtraer } from "./prompts.ts";
import temas from "./temas.json" with { type: "json" };

const M_EXTRAER = "google/gemini-3.1-pro-preview";
const M_EXPLICAR = "anthropic/claude-sonnet-5";
const M_OPENAI = "gpt-4.1-mini"; // modelo económico con visión

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

/** ¿Está configurada la IA? Sin clave, las cartillas no se pueden leer. */
export const iaConfigurada = () => Boolean(env("AI_GATEWAY_API_KEY") || env("OPENAI_API_KEY"));

type Papel = "extraer" | "explicar";

/** Modelo según el proveedor: el Gateway usa ids con proveedor; OpenAI usa los suyos. */
function modelo(papel: Papel) {
  if (env("AI_GATEWAY_API_KEY")) return papel === "extraer" ? M_EXTRAER : M_EXPLICAR;
  return env(papel === "extraer" ? "MODELO_EXTRAER" : "MODELO_EXPLICAR") ?? M_OPENAI;
}

/** Llamada directa a la API de OpenAI (Chat Completions) con texto e imágenes. */
async function openaiJSON(model: string, content: any[], system: string, key: string | undefined) {
  if (!key) throw new Error("Esta cuenta no tiene clave de IA configurada.");
  const base = String(env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const partes = content.map((p: any) =>
    p.type === "image"
      ? {
          type: "image_url",
          image_url: { url: `data:${p.mediaType};base64,${Buffer.from(p.image).toString("base64")}` },
        }
      : { type: "text", text: String(p.text ?? "") },
  );
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: partes },
      ],
      max_completion_tokens: 32000,
    }),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    let m = cuerpo;
    try {
      m = JSON.parse(cuerpo)?.error?.message ?? cuerpo;
    } catch {}
    throw new Error(`OpenAI ${r.status}: ${String(m).slice(0, 240)}`);
  }
  const data = JSON.parse(cuerpo);
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const f = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (f ? f[1] : text).trim();
  return JSON.parse(raw.slice(raw.search(/[\[{]/)));
}

async function askJSON(papel: Papel, content: any[], system: string, clave?: string | null, tries = 3) {
  // Con la clave propia de una cuenta se va siempre a OpenAI; el gateway es solo del servidor.
  const viaGateway = !clave && Boolean(env("AI_GATEWAY_API_KEY"));
  const gw = viaGateway
    ? createGateway({ baseURL: env("AI_GATEWAY_BASE_URL"), apiKey: env("AI_GATEWAY_API_KEY") })
    : null;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      if (gw) {
        const { text } = await generateText({
          model: gw(modelo(papel)),
          system,
          messages: [{ role: "user", content }],
          maxOutputTokens: 32000,
        });
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const raw = (m ? m[1] : text).trim();
        return JSON.parse(raw.slice(raw.search(/[\[{]/)));
      }
      return await openaiJSON(modelo(papel), content, system, clave ?? env("OPENAI_API_KEY"));
    } catch (e) {
      last = e;
      const t = String((e as Error)?.message ?? e);
      // La clave no sirve o no hay saldo: reintentar no arregla nada.
      if (/401|403|invalid_api_key|insufficient_quota|no credits remaining|billing/i.test(t)) break;
    }
  }
  throw last;
}

const imagen = (dataUrl: string) => {
  const [meta, b64] = dataUrl.split(",");
  return { type: "image", image: Buffer.from(b64, "base64"), mediaType: meta.slice(5, meta.indexOf(";")) };
};

export async function ejecutar(e: any, clave?: string | null) {
  if (e.tipo === "extraer") {
    const imgs: string[] = e.imagenes.slice(0, 2);
    const content: any[] = [{ type: "text", text: promptExtraer(imgs.length, e.materia ?? null, e.pagina, e.total) }, ...imgs.map(imagen)];
    return askJSON("extraer", content, SYS_EXTRAER, clave);
  }
  const materia = e.materia as keyof typeof temas;
  const lista = (temas[materia] ?? []).map((t: any) => `- ${t.id}: ${t.nombre} — ${t.desc}`).join("\n");
  const content: any[] = [{ type: "text", text: promptExplicar(e.unidad, e.claves ?? {}, lista) }, ...(e.imagenes ?? []).slice(0, 6).map(imagen)];
  return askJSON("explicar", content, SYS_EXPLICAR, clave);
}
