// Núcleo de los trabajos de IA (lo usan la función de Netlify y el servidor local de desarrollo).
import { createGateway, generateText } from "ai";
import { SYS_EXPLICAR, SYS_EXTRAER, promptExplicar, promptExtraer } from "./prompts.ts";
import temas from "./temas.json" with { type: "json" };

const M_EXTRAER = "google/gemini-3.1-pro-preview";
const M_EXPLICAR = "anthropic/claude-sonnet-5";
const M_OPENAI = "gpt-4.1-mini"; // modelo económico con visión
const M_GOOGLE = "gemini-3.5-flash-lite"; // modelo del nivel gratuito de Google AI Studio
const M_OPENROUTER = "nvidia/nemotron-3.5-super-vl:free"; // modelo gratis con visión de OpenRouter
// Modelos gratuitos de respaldo: el nivel gratuito cambia por proyecto y algunos modelos
// no se pueden usar para generar contenido, así que se prueban en este orden.
const GOOGLE_ALTERNOS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
];
// OpenRouter retira y renombra sus modelos «:free» muy seguido, así que también se prueban
// en orden: si uno ya no existe (404) o no acepta imágenes, se salta al siguiente.
const OPENROUTER_ALTERNOS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "inclusionai/ling-3.2-flash:free",
  "particle-ai/particle-1:free",
  "openrouter/free",
];

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

/** ¿Está configurada la IA? Sin clave, las cartillas no se pueden leer. */
export const iaConfigurada = () =>
  Boolean(
    env("AI_GATEWAY_API_KEY") || env("OPENAI_API_KEY") || env("GEMINI_API_KEY") || env("OPENROUTER_API_KEY"),
  );

type Papel = "extraer" | "explicar";
type Proveedor = "openai" | "google" | "openrouter";

/**
 * El proveedor sale de la propia clave, sin configuración extra:
 * OpenAI empieza por sk-, OpenRouter por sk-or- (modelos «:free») y Google AI Studio por
 * AIza (formato viejo) o AQ. (el que entrega AI Studio desde 2026).
 * sk-or- se mira primero porque también empieza por sk-.
 */
function proveedor(clave?: string | null): Proveedor {
  const t = String(clave ?? "").trim();
  if (t.startsWith("sk-or-")) return "openrouter";
  return t.startsWith("AIza") || t.startsWith("AQ.") ? "google" : "openai";
}

const NOMBRE: Record<Proveedor, string> = { openai: "OpenAI", google: "Gemini", openrouter: "OpenRouter" };

const BASE: Record<Proveedor, string> = {
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
};

/** Modelo por defecto de cada proveedor (los del Gateway se llaman distinto). */
const POR_DEFECTO: Record<Proveedor, string> = {
  openai: M_OPENAI,
  google: M_GOOGLE,
  openrouter: M_OPENROUTER,
};

/** Modelo según el proveedor real de la llamada: el Gateway usa ids con proveedor; los demás, los suyos. */
function modelo(papel: Papel, prov: Proveedor = "openai", viaGateway = false) {
  if (viaGateway) return papel === "extraer" ? M_EXTRAER : M_EXPLICAR;
  return modeloPropio(papel) || POR_DEFECTO[prov];
}

const modeloPropio = (papel: Papel) =>
  String(env(papel === "extraer" ? "MODELO_EXTRAER" : "MODELO_EXPLICAR") ?? "").trim();

/** Lista de modelos a probar: el forzado por entorno o los gratuitos del proveedor, en orden. */
function modelosDe(papel: Papel, prov: Proveedor): string[] {
  const propio = modeloPropio(papel);
  if (propio) return [propio];
  const lista =
    prov === "google"
      ? [M_GOOGLE, ...GOOGLE_ALTERNOS]
      : prov === "openrouter"
        ? [M_OPENROUTER, ...OPENROUTER_ALTERNOS]
        : [POR_DEFECTO[prov]];
  return lista.filter((m, i, todos) => todos.indexOf(m) === i);
}

/** Errores que dicen "ese modelo no está o no sirve para generar contenido": hay que pasar a otro. */
const modeloNoSirve = (t: string) =>
  /\b404\b|not found|no endpoints|not a valid model|not supported for generateContent|is not supported|unsupported model|does not support/i.test(
    t,
  );

/** Traduce los fallos típicos de Google a algo accionable desde la app. */
function pistaGoogle(mensaje: string) {
  const t = mensaje.toLowerCase();
  if (t.includes("free tier is not available in your country"))
    return " El nivel gratuito de Gemini no está disponible en tu región: hay que activar la facturación en Google AI Studio.";
  if (t.includes("has not been used in project") || t.includes("service_disabled") || t.includes("generative language api"))
    return " Activa la API «Generative Language» en tu proyecto: console.cloud.google.com/apis/library/generativelanguage.googleapis.com";
  if (t.includes("are blocked") || t.includes("api_key_service_blocked") || t.includes("requests to this api"))
    return " Tu clave tiene restricciones de API: edítala y permite «Generative Language API» (o elige «No restringir clave»).";
  if (t.includes("api key not valid") || t.includes("api_key_invalid"))
    return " La clave no es válida: cópiala de nuevo desde aistudio.google.com/apikey.";
  if (t.includes("permission_denied"))
    return " El proyecto de esa clave no tiene permiso para usar la API de Gemini.";
  return "";
}

/** Traduce los fallos típicos de OpenRouter (nivel gratuito) a algo accionable. */
function pistaOpenRouter(mensaje: string) {
  const t = mensaje.toLowerCase();
  if (t.includes("no endpoints found") || t.includes("not a valid model"))
    return " Ese modelo gratuito ya no existe en OpenRouter: se prueba el siguiente de la lista.";
  if (t.includes("free-models-per-day") || t.includes("free_model_daily") || t.includes("free model") )
    return " Llegaste al tope del nivel gratuito de OpenRouter (20 peticiones por minuto y 50 al día): espera o usa otra clave.";
  if (t.includes("rate limit") || /\b429\b/.test(t))
    return " Demasiadas peticiones en poco tiempo: espera un momento o usa otra clave.";
  if (t.includes("insufficient credit") || /\b402\b/.test(t))
    return " Tu cuenta de OpenRouter no tiene saldo. Los modelos «:free» no lo necesitan: revisa que el modelo termine en «:free».";
  if (t.includes("user not found"))
    return " OpenRouter no reconoce esa clave: pégala de nuevo desde openrouter.ai/keys (empieza por sk-or-).";
  if (t.includes("no auth") || t.includes("invalid api key") || /\b401\b/.test(t))
    return " La clave no es válida: cópiala de nuevo desde openrouter.ai/keys (empieza por sk-or-).";
  return "";
}

/** Saca el primer objeto/arreglo JSON del texto, venga o no dentro de un bloque de código. */
function recoger(text: string) {
  const f = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (f ? f[1] : text).trim();
  return JSON.parse(raw.slice(raw.search(/[\[{]/)));
}

/** Error de Gemini, con la pista en español cuando se puede deducir la causa. */
function falloGoogle(status: number, cuerpo: string) {
  let m: any = cuerpo;
  try {
    m = JSON.parse(cuerpo)?.error?.message ?? cuerpo;
  } catch {}
  const texto = String(m);
  return new Error(`Gemini ${status}: ${texto.slice(0, 240)}${pistaGoogle(texto)}`);
}

/**
 * Llamada nativa de Gemini. Es la única que acepta las claves nuevas de AI Studio
 * (empiezan por AQ.): el endpoint compatible con OpenAI las rechaza con 401.
 */
async function geminiJSON(model: string, content: any[], system: string, key: string) {
  const partes = content.map((p: any) =>
    p.type === "image"
      ? { inline_data: { mime_type: p.mediaType, data: Buffer.from(p.image).toString("base64") } }
      : { text: String(p.text ?? "") },
  );
  const r = await fetch(`${BASE.google}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: partes }],
      generationConfig: { maxOutputTokens: 16000 },
    }),
  });
  const cuerpo = await r.text();
  if (!r.ok) throw falloGoogle(r.status, cuerpo);
  const data = JSON.parse(cuerpo);
  // Los modelos que razonan devuelven partes "thought" que no son la respuesta.
  const text = (data?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => String(p.text ?? ""))
    .join("");
  return recoger(text);
}

/**
 * Llamada directa a OpenAI y a OpenRouter: los dos usan el formato Chat Completions,
 * así que solo cambian la base, las cabeceras y el nombre del límite de tokens.
 */
async function chatJSON(prov: "openai" | "openrouter", model: string, content: any[], system: string, key: string) {
  const base = String(env(prov === "openrouter" ? "OPENROUTER_BASE_URL" : "OPENAI_BASE_URL") ?? BASE[prov]).replace(
    /\/+$/,
    "",
  );
  const partes = content.map((p: any) =>
    p.type === "image"
      ? {
          type: "image_url",
          image_url: { url: `data:${p.mediaType};base64,${Buffer.from(p.image).toString("base64")}` },
        }
      : { type: "text", text: String(p.text ?? "") },
  );
  const cabeceras: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };
  // OpenRouter pide identificar la app que hace las peticiones (es opcional, pero recomendado).
  if (prov === "openrouter") {
    cabeceras["HTTP-Referer"] = String(env("APP_URL") ?? "https://idea-icfes-tracker.netlify.app");
    cabeceras["X-Title"] = "IDEA · ICFES Error Tracker";
  }
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: partes },
      ],
      ...(prov === "openrouter" ? { max_tokens: 16000 } : { max_completion_tokens: 32000 }),
    }),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    let m: any = cuerpo;
    try {
      m = JSON.parse(cuerpo)?.error?.message ?? cuerpo;
    } catch {}
    const texto = String(m);
    const pista = prov === "openrouter" ? pistaOpenRouter(texto) : "";
    throw new Error(`${NOMBRE[prov]} ${r.status}: ${texto.slice(0, 240)}${pista}`);
  }
  const data = JSON.parse(cuerpo);
  return recoger(data?.choices?.[0]?.message?.content ?? "");
}

async function askJSON(papel: Papel, content: any[], system: string, clave?: string | null, tries = 3) {
  // Con la clave propia de una cuenta se va a su proveedor (OpenAI, Google u OpenRouter);
  // el gateway es solo del servidor.
  const viaGateway = !clave && Boolean(env("AI_GATEWAY_API_KEY"));
  const gw = viaGateway
    ? createGateway({ baseURL: env("AI_GATEWAY_BASE_URL"), apiKey: env("AI_GATEWAY_API_KEY") })
    : null;
  const usada =
    clave ?? env("OPENAI_API_KEY") ?? env("GEMINI_API_KEY") ?? env("OPENROUTER_API_KEY") ?? null;
  const prov = proveedor(usada);
  // Con clave gratuita (Google u OpenRouter) se prueban varios modelos: si uno no existe
  // o no genera contenido, se pasa al siguiente sin molestar a la cuenta.
  const modelos = viaGateway ? [modelo(papel, prov, true)] : modelosDe(papel, prov);
  // Con claves gratuitas el tope es de cuota: se le da más margen antes de rendirse.
  const intentos = prov === "google" ? Math.max(tries, 4) : tries;
  let last: unknown;
  for (const model of modelos) {
    for (let i = 0; i < intentos; i++) {
      try {
        if (gw) {
          const { text } = await generateText({
            model: gw(model),
            system,
            messages: [{ role: "user", content }],
            maxOutputTokens: 32000,
          });
          const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          const raw = (m ? m[1] : text).trim();
          return JSON.parse(raw.slice(raw.search(/[\[{]/)));
        }
        if (!usada) throw new Error("Esta cuenta no tiene clave de IA configurada.");
        return prov === "google"
          ? await geminiJSON(model, content, system, usada)
          : await chatJSON(prov, model, content, system, usada);
      } catch (e) {
        last = e;
        const t = String((e as Error)?.message ?? e);
        // La clave no sirve o no hay saldo: reintentar (o cambiar de modelo) no arregla nada.
        // Ojo: el error de cuota de Gemini dice "check your plan and billing details", así que
        // "billing" no puede contar como fallo definitivo (se quedaría sin reintentar).
        if (
          /401|403|invalid_api_key|API key not valid|insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(t)
        )
          throw e;
        // Ese modelo no está disponible en el proyecto o no sirve para generar contenido.
        if (modeloNoSirve(t)) break;
        // El nivel gratuito de OpenRouter es un tope diario: reintentar solo gasta cupo.
        if (prov === "openrouter" && /429|RESOURCE_EXHAUSTED|rate limit/i.test(t)) throw e;
        // En el nivel gratuito de Google los límites son por minuto: vale la pena esperar y reintentar.
        if (prov === "google" && /429|RESOURCE_EXHAUSTED|rate limit/i.test(t)) {
          // Google dice en el error cuántos segundos faltan ("Please retry in 34.5s"): se respeta.
          const sugiere = Number(t.match(/retry in ([\d.]+)s/i)?.[1] ?? 0);
          // El azar evita que las 4 páginas en paralelo vuelvan a chocar a la vez.
          const ms =
            (sugiere ? Math.min(sugiere * 1000 + 800, 45_000) : Math.min(15_000 * (i + 1), 45_000)) +
            Math.floor(Math.random() * 3000);
          await new Promise((listo) => setTimeout(listo, ms));
        } else if (/503|UNAVAILABLE|high demand|overloaded/i.test(t)) {
          // Saturación puntual del modelo: se espera un poco antes de reintentar.
          await new Promise((listo) => setTimeout(listo, 1500 * (i + 1)));
        }
      }
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
