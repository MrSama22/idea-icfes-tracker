// Núcleo de los trabajos de IA (lo usan la función de Netlify y el servidor local de desarrollo).
import { createGateway, generateText } from "ai";
import { clavesServidor, normalizarClaves } from "./claves.ts";
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
// Otros servicios con nivel gratuito que se pueden sumar como respaldo cuando el principal
// llega a su tope: Groq y Cerebras son de texto (no leen figuras), Mistral y NVIDIA sí ven.
const M_GROQ = "openai/gpt-oss-120b";
const GROQ_ALTERNOS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"];
const M_MISTRAL = "mistral-small-2506";
const MISTRAL_ALTERNOS = ["ministral-8b-2512", "mistral-medium-2508"];
const M_NVIDIA = "meta/llama-4-maverick-17b-128e-instruct";
const NVIDIA_ALTERNOS = ["microsoft/phi-4-multimodal-instruct"];
const M_CEREBRAS = "gpt-oss-120b";
const CEREBRAS_ALTERNOS = ["llama3.1-8b"];

function env(k: string) {
  return (globalThis as any).Netlify?.env.get(k) ?? process.env[k];
}

/** ¿Está configurada la IA en el servidor? Sin clave, las cartillas no se pueden leer. */
export const iaConfigurada = () => clavesServidor().length > 0;

type Papel = "extraer" | "explicar";
type Proveedor = "openai" | "google" | "openrouter" | "groq" | "mistral" | "nvidia" | "cerebras";

/**
 * El proveedor sale de la propia clave, sin configuración extra:
 * OpenAI empieza por sk-, OpenRouter por sk-or- (modelos «:free»), Google AI Studio por
 * AIza o AQ., Groq por gsk_, Mistral por mstrl_, NVIDIA por nvapi- y Cerebras por csk-.
 * sk-or- se mira primero porque también empieza por sk-. Una clave de Mistral sin prefijo
 * propio se puede guardar como «mistral:la-clave».
 */
function proveedor(clave?: string | null): Proveedor {
  const t = String(clave ?? "").trim();
  const escrito = t
    .match(/^(openai|google|gemini|openrouter|groq|mistral|nvidia|cerebras):/i)?.[1]
    ?.toLowerCase();
  if (escrito) return (escrito === "gemini" ? "google" : escrito) as Proveedor;
  if (t.startsWith("sk-or-")) return "openrouter";
  if (t.startsWith("gsk_")) return "groq";
  if (t.startsWith("mstrl_")) return "mistral";
  if (t.startsWith("nvapi-")) return "nvidia";
  if (t.startsWith("csk-")) return "cerebras";
  return t.startsWith("AIza") || t.startsWith("AQ.") ? "google" : "openai";
}

/** La clave sin el «proveedor:» con el que se guardó. */
const sinPrefijo = (clave: string) =>
  String(clave).replace(/^(openai|google|gemini|openrouter|groq|mistral|nvidia|cerebras):/i, "");

const NOMBRE: Record<Proveedor, string> = {
  openai: "OpenAI",
  google: "Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
  mistral: "Mistral",
  nvidia: "NVIDIA",
  cerebras: "Cerebras",
};

const BASE: Record<Proveedor, string> = {
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  cerebras: "https://api.cerebras.ai/v1",
};

/** Los modelos gratis de Groq y Cerebras son de texto: no sirven para una página con figuras. */
const VE: Record<Proveedor, boolean> = {
  openai: true,
  google: true,
  openrouter: true,
  groq: false,
  mistral: true,
  nvidia: true,
  cerebras: false,
};

/** Modelo por defecto de cada proveedor (los del Gateway se llaman distinto). */
const POR_DEFECTO: Record<Proveedor, string> = {
  openai: M_OPENAI,
  google: M_GOOGLE,
  openrouter: M_OPENROUTER,
  groq: M_GROQ,
  mistral: M_MISTRAL,
  nvidia: M_NVIDIA,
  cerebras: M_CEREBRAS,
};

/** Modelos gratuitos de respaldo de cada proveedor, en el orden en que se prueban. */
const ALTERNOS: Record<Proveedor, string[]> = {
  openai: [],
  google: GOOGLE_ALTERNOS,
  openrouter: OPENROUTER_ALTERNOS,
  groq: GROQ_ALTERNOS,
  mistral: MISTRAL_ALTERNOS,
  nvidia: NVIDIA_ALTERNOS,
  cerebras: CEREBRAS_ALTERNOS,
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
  return [POR_DEFECTO[prov], ...ALTERNOS[prov]].filter((m, i, todos) => todos.indexOf(m) === i);
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
async function chatJSON(
  prov: Exclude<Proveedor, "google">,
  model: string,
  content: any[],
  system: string,
  key: string,
) {
  const base = String(env(`${prov.toUpperCase()}_BASE_URL`) ?? BASE[prov]).replace(/\/+$/, "");
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
      ...(prov === "openai"
        ? { max_completion_tokens: 32000 }
        : { max_tokens: prov === "openrouter" ? 16000 : 8000 }),
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

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/** Las claves recibidas (una, varias o ninguna) como lista limpia. */
function listaClaves(clave?: string | string[] | null): string[] {
  const crudas = (Array.isArray(clave) ? clave : clave ? [clave] : [])
    .flatMap((x) => String(x ?? "").split(/[\s,;]+/))
    .filter(Boolean);
  const ok = normalizarClaves(crudas.join(" "));
  return ok.length ? ok : crudas;
}

async function askJSON(
  papel: Papel,
  content: any[],
  system: string,
  clave?: string | string[] | null,
  tries = 3,
) {
  const propias = listaClaves(clave);
  // La clave de la cuenta manda; si no hay, se usan las del servidor (solo llegan aquí si es admin).
  const claves = propias.length ? propias : clavesServidor();
  const hayImagenes = content.some((p: any) => p?.type === "image");
  const fallos: string[] = [];
  let last: unknown;

  // Sin ninguna clave se usa el gateway del servidor, si está configurado.
  if (!claves.length) {
    if (!env("AI_GATEWAY_API_KEY")) throw new Error("Esta cuenta no tiene clave de IA configurada.");
    const gw = createGateway({ baseURL: env("AI_GATEWAY_BASE_URL"), apiKey: env("AI_GATEWAY_API_KEY") });
    for (let i = 0; i < tries; i++) {
      try {
        const { text } = await generateText({
          model: gw(modelo(papel, "openai", true)),
          system,
          messages: [{ role: "user", content }],
          maxOutputTokens: 32000,
        });
        const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const raw = (m ? m[1] : text).trim();
        return JSON.parse(raw.slice(raw.search(/[\[{]/)));
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }

  // Rotación entre claves: cada una se prueba con sus modelos gratuitos; si llega a su tope
  // (o la rechazan), se pasa a la siguiente sin molestar a la cuenta. Una cartilla larga puede
  // terminar usando el cupo de OpenRouter, luego el de Gemini, luego el de Groq, etc.
  for (const k of claves) {
    const prov = proveedor(k);
    const token = sinPrefijo(k);
    // Una página con figuras necesita un modelo que vea imágenes.
    if (hayImagenes && !VE[prov]) {
      fallos.push(`${NOMBRE[prov]} no lee imágenes`);
      continue;
    }
    const intentos = prov === "google" ? Math.max(tries, 3) : tries;
    let cortar = false; // esta clave ya no da más: siguiente
    let sinCupo = 0; // modelos de esta clave que ya respondieron «sin cupo»
    for (const model of modelosDe(papel, prov)) {
      if (cortar) break;
      for (let i = 0; i < intentos; i++) {
        try {
          return prov === "google"
            ? await geminiJSON(model, content, system, token)
            : await chatJSON(prov, model, content, system, token);
        } catch (e) {
          last = e;
          const t = String((e as Error)?.message ?? e);
          // Sin cupo (429) — puede venir como RESOURCE_EXHAUSTED o insufficient_quota.
          if (/429|resource_exhausted|rate limit|too many requests|insufficient_quota/i.test(t)) {
            // Si es la ÚNICA clave y es de Gemini, sus topes son por minuto: vale esperar.
            if (prov === "google" && claves.length === 1 && i + 1 < intentos) {
              const sugiere = Number(t.match(/retry in ([\d.]+)s/i)?.[1] ?? 0);
              const ms =
                (sugiere ? Math.min(sugiere * 1000 + 800, 45_000) : Math.min(15_000 * (i + 1), 45_000)) +
                Math.floor(Math.random() * 3000);
              await esperar(ms);
              continue;
            }
            // El tope puede ser del modelo y no de la cuenta (cada modelo gratis tiene el suyo),
            // así que antes de dar la clave por agotada se prueba otro modelo del proveedor.
            sinCupo++;
            fallos.push(`${NOMBRE[prov]} sin cupo`);
            if (sinCupo < 3) break; // siguiente modelo de esta misma clave
            cortar = true;
            break;
          }
          // Clave rechazada o sin saldo: reintentar aquí tampoco sirve.
          if (/401|402|403|invalid_api_key|API key not valid|user not found|credit|exhausted/i.test(t)) {
            fallos.push(`${NOMBRE[prov]} rechazó la clave`);
            cortar = true;
            break;
          }
          // Ese modelo no existe o no sirve para generar contenido: se prueba el siguiente.
          if (modeloNoSirve(t)) break;
          // La petición no cabe (imagen enorme, formato raro): otro modelo no lo arregla.
          if (/\b400\b/.test(t)) break;
          if (/503|unavailable|high demand|overloaded|timed? ?out/i.test(t)) await esperar(1500 * (i + 1));
        }
      }
    }
  }

  const detalle = [...new Set(fallos)].slice(0, 4).join(" · ");
  const ultimo = String((last as Error)?.message ?? last ?? "").slice(0, 220);
  // Con una sola clave se devuelve su error tal cual (ya trae la pista del proveedor).
  if (claves.length === 1) throw last ?? new Error(ultimo || "No se pudo leer con IA.");
  throw new Error(
    `Se agotaron tus ${claves.length} claves de IA${detalle ? ` (${detalle})` : ""}. ` +
      `Pega otra clave en «Tu clave de IA» o espera a que se reinicie el tope. ${ultimo}`.trim(),
  );
}

const imagen = (dataUrl: string) => {
  const [meta, b64] = dataUrl.split(",");
  return { type: "image", image: Buffer.from(b64, "base64"), mediaType: meta.slice(5, meta.indexOf(";")) };
};

export async function ejecutar(e: any, clave?: string | string[] | null) {
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
