// Núcleo de los trabajos de IA (lo usan la función de Netlify y el servidor local de desarrollo).
import { createGateway, generateText } from "ai";
import { SYS_EXPLICAR, SYS_EXTRAER, promptExplicar, promptExtraer } from "./prompts.ts";
import temas from "./temas.json" with { type: "json" };

const M_EXTRAER = "google/gemini-3.1-pro-preview";
const M_EXPLICAR = "anthropic/claude-sonnet-5";

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

async function askJSON(model: string, content: any[], system: string, tries = 3) {
  const gw = createGateway({ baseURL: env("AI_GATEWAY_BASE_URL"), apiKey: env("AI_GATEWAY_API_KEY") });
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const { text } = await generateText({ model: gw(model), system, messages: [{ role: "user", content }], maxOutputTokens: 32000 });
      const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const raw = (m ? m[1] : text).trim();
      return JSON.parse(raw.slice(raw.search(/[\[{]/)));
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const imagen = (dataUrl: string) => {
  const [meta, b64] = dataUrl.split(",");
  return { type: "image", image: Buffer.from(b64, "base64"), mediaType: meta.slice(5, meta.indexOf(";")) };
};

export async function ejecutar(e: any) {
  if (e.tipo === "extraer") {
    const imgs: string[] = e.imagenes.slice(0, 2);
    const content: any[] = [{ type: "text", text: promptExtraer(imgs.length, e.materia ?? null, e.pagina, e.total) }, ...imgs.map(imagen)];
    return askJSON(M_EXTRAER, content, SYS_EXTRAER);
  }
  const materia = e.materia as keyof typeof temas;
  const lista = (temas[materia] ?? []).map((t: any) => `- ${t.id}: ${t.nombre} — ${t.desc}`).join("\n");
  const content: any[] = [{ type: "text", text: promptExplicar(e.unidad, e.claves ?? {}, lista) }, ...(e.imagenes ?? []).slice(0, 6).map(imagen)];
  return askJSON(M_EXPLICAR, content, SYS_EXPLICAR);
}

