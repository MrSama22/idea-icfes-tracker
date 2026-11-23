// Núcleo de los trabajos de IA (lo usan la función de Netlify y el servidor local de desarrollo).
import { createGateway, generateText } from "ai";
import { SYS_EXPLICAR, SYS_EXTRAER, promptExplicar, promptExtraer } from "./prompts.ts";
import temas from "./temas.json" with { type: "json" };

const M_EXTRAER = "google/gemini-3.1-pro-preview";
const M_EXPLICAR = "anthropic/claude-sonnet-5";
const M_OPENAI = "gpt-4.1-mini"; // modelo económico con visión
const M_GOOGLE = "gemini-3.5-flash-lite"; // modelo del nivel gratuito de Google AI Studio
// Modelos gratuitos de respaldo: el nivel gratuito cambia por proyecto y algunos modelos
// no se pueden usar para generar contenido, así que se prueban en este orden.
const GOOGLE_ALTERNOS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
];

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

/** ¿Está configurada la IA? Sin clave, las cartillas no se pueden leer. */
export const iaConfigurada = () =>
  Boolean(env("AI_GATEWAY_API_KEY") || env("OPENAI_API_KEY") || env("GEMINI_API_KEY"));

type Papel = "extraer" | "explicar";
type Proveedor = "openai" | "google";

/**
 * El proveedor sale de la propia clave: las de Google AI Studio empiezan por AIza
 * (formato viejo) o por AQ. (formato nuevo que entrega AI Studio desde 2026).
 */
function proveedor(clave?: string | null): Proveedor {
  const t = String(clave ?? "").trim();
  return t.startsWith("AIza") || t.startsWith("AQ.") ? "google" : "openai";
}

const NOMBRE: Record<Proveedor, string> = { openai: "OpenAI", google: "Gemini" };

const BASE: Record<Proveedor, string> = {
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

/** Modelo según el proveedor real de la llamada: el Gateway usa ids con proveedor; OpenAI y Gemini los suyos. */
function modelo(papel: Papel, prov: Proveedor = "openai", viaGateway = false) {
  if (viaGateway) return papel === "extraer" ? M_EXTRAER : M_EXPLICAR;
  return modeloPropio(papel) || (prov === "google" ? M_GOOGLE : M_OPENAI);
}

const modeloPropio = (papel: Papel) =>
  String(env(papel === "extraer" ? "MODELO_EXTRAER" : "MODELO_EXPLICAR") ?? "").trim();

/** Lista de modelos de Google a probar: el forzado por entorno o los gratuitos en orden. */
function modelosGoogle(papel: Papel): string[] {
  const propio = modeloPropio(papel);
  if (propio) return [propio];
  return [M_GOOGLE, ...GOOGLE_ALTERNOS].filter((m, i, todos) => todos.indexOf(m) === i);
}

/** Errores de Google que "no sirven para generar contenido": hay que pasar a otro modelo. */
const modeloNoSirve = (t: string) =>
  /\b404\b|not found|not supported for generateContent|is not supported|unsupported model|does not support/i.test(t);

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

/** Llamada directa a OpenAI (Chat Completions) con texto e imágenes. */
async function chatJSON(model: string, content: any[], system: string, key: string) {
  const base = String(env("OPENAI_BASE_URL") ?? BASE.openai).replace(/\/+$/, "");
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
    let m: any = cuerpo;
    try {
      m = JSON.parse(cuerpo)?.error?.message ?? cuerpo;
    } catch {}
    throw new Error(`${NOMBRE.openai} ${r.status}: ${String(m).slice(0, 240)}`);
  }
  const data = JSON.parse(cuerpo);
  return recoger(data?.choices?.[0]?.message?.content ?? "");
}

async function askJSON(papel: Papel, content: any[], system: string, clave?: string | null, tries = 3) {
  // Con la clave propia de una cuenta se va a su proveedor (OpenAI o Google); el gateway es solo del servidor.
  const viaGateway = !clave && Boolean(env("AI_GATEWAY_API_KEY"));
  const gw = viaGateway
    ? createGateway({ baseURL: env("AI_GATEWAY_BASE_URL"), apiKey: env("AI_GATEWAY_API_KEY") })
    : null;
  const usada = clave ?? env("OPENAI_API_KEY") ?? env("GEMINI_API_KEY") ?? null;
  const prov = proveedor(usada);
  // Con clave de Google se prueban varios modelos gratuitos: si uno no existe o no genera
  // contenido, se pasa al siguiente sin molestar a la cuenta.
  const modelos = prov === "google" && !viaGateway ? modelosGoogle(papel) : [modelo(papel, prov, viaGateway)];
  let last: unknown;
  for (const model of modelos) {
    for (let i = 0; i < tries; i++) {
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
          : await chatJSON(model, content, system, usada);
      } catch (e) {
        last = e;
        const t = String((e as Error)?.message ?? e);
        // La clave no sirve o no hay saldo: reintentar (o cambiar de modelo) no arregla nada.
        if (/401|403|invalid_api_key|API key not valid|insufficient_quota|no credits remaining|billing/i.test(t)) throw e;
        // Ese modelo no está disponible en el proyecto o no sirve para generar contenido.
        if (modeloNoSirve(t)) break;
        // En el nivel gratuito de Google los límites son por minuto: vale la pena esperar y reintentar.
        if (prov === "google" && /429|RESOURCE_EXHAUSTED|rate limit/i.test(t)) {
          await new Promise((listo) => setTimeout(listo, 2500 * (i + 1)));
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
