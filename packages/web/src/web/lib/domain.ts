// Modelo de dominio de IDEA (equivalente a los modelos Simulacro / ErrorRegistrado del backend propuesto).

export const MATERIAS = [
  { id: "MAT", nombre: "Matemáticas", corto: "Mate", key: "m", color: "#16150F", preguntas: 50 },
  {
    id: "LEC",
    nombre: "Lectura Crítica",
    corto: "Lectura",
    key: "l",
    color: "#7A4E2D",
    preguntas: 41,
  },
  {
    id: "CIE",
    nombre: "Ciencias Naturales",
    corto: "Ciencias",
    key: "c",
    color: "#2E7D4F",
    preguntas: 58,
  },
  {
    id: "SOC",
    nombre: "Sociales y Ciudadanas",
    corto: "Sociales",
    key: "s",
    color: "#8C3B6E",
    preguntas: 50,
  },
  { id: "ING", nombre: "Inglés", corto: "Inglés", key: "i", color: "#2F5DA8", preguntas: 55 },
] as const;

export const TIPOS = [
  {
    id: "VACIO",
    nombre: "Vacío conceptual",
    corto: "Vacío",
    key: "v",
    color: "#E2401C",
    consejo:
      "Vuelve a la teoría: repasa el tema base y haz 10 ejercicios guiados antes de otro simulacro.",
  },
  {
    id: "TRAMPA",
    nombre: "Trampa del distractor",
    corto: "Distractor",
    key: "d",
    color: "#D99A06",
    consejo:
      "Relee el enunciado, subraya qué preguntan y descarta opciones antes de elegir. Justifica por qué las otras son falsas.",
  },
  {
    id: "TIEMPO",
    nombre: "Falta de tiempo / Adivinanza",
    corto: "Tiempo",
    key: "t",
    color: "#2F5DA8",
    consejo:
      "Entrena por bloques cronometrados (≈1,5 min por pregunta) y aplica la regla de saltar y volver.",
  },
] as const;

export type MateriaId = (typeof MATERIAS)[number]["id"];
export type TipoId = (typeof TIPOS)[number]["id"];

export interface Simulacro {
  id: string;
  nombre: string;
  fecha: string; // ISO
  duracionMin: number;
  preguntas: Record<MateriaId, number>;
  // Temporizador
  acumuladoMs: number;
  iniciadoEn: number | null; // epoch ms si está corriendo
  finalizado: boolean;
  creadoEn: number;
  updatedAt?: number; // última edición (para sincronizar)
}

export interface ErrorRegistrado {
  id: string;
  simulacroId: string;
  materia: MateriaId;
  numeroPregunta: number;
  tipo: TipoId;
  nota: string;
  timestamp: number; // epoch ms
  minuto: number | null; // minuto del simulacro en que se registró
  updatedAt?: number;
}

export const materiaById = (id: MateriaId) => MATERIAS.find((m) => m.id === id)!;
export const tipoById = (id: TipoId) => TIPOS.find((t) => t.id === id)!;

export const defaultPreguntas = (): Record<MateriaId, number> =>
  Object.fromEntries(MATERIAS.map((m) => [m.id, m.preguntas])) as Record<MateriaId, number>;

export const totalPreguntas = (s: Simulacro) =>
  Object.values(s.preguntas).reduce((a, b) => a + (Number(b) || 0), 0);

export function elapsedMs(s: Simulacro, now = Date.now()) {
  return s.acumuladoMs + (s.iniciadoEn ? now - s.iniciadoEn : 0);
}

export function fmtClock(ms: number) {
  const neg = ms < 0;
  const t = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${neg ? "+" : ""}${h}:${p(m)}:${p(s)}`;
}

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// --- Simulacros generados desde el banco de preguntas oficiales ---
export interface PracticaItem {
  /** id de la unidad (pregunta suelta o grupo con texto común) */
  u: string;
  /** preguntas de la unidad incluidas (si es parte de un grupo, el contexto se muestra completo) */
  qs: number[];
}

export interface Practica {
  id: string;
  tipo: "simulacro" | "tema";
  modo: "examen" | "practica"; // examen: resultados al final · practica: explicación al instante
  nombre: string;
  temaId?: string;
  materias: MateriaId[];
  duracionMin: number; // 0 = sin límite
  items: PracticaItem[];
  /** "unidad:n" → letra elegida */
  respuestas: Record<string, string>;
  marcadas: string[];
  actual: number; // índice de la pregunta abierta
  acumuladoMs: number;
  iniciadoEn: number | null;
  finalizado: boolean;
  finalizadoEn?: number;
  registroId?: string; // simulacro del registro de errores creado al terminar
  creadoEn: number;
  updatedAt?: number;
}

export const qkey = (u: string, n: number) => `${u}:${n}`;
