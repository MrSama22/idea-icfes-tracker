import { useState } from "react";
import { Check, ChevronDown, Lightbulb, Target, TriangleAlert, Wrench, X } from "lucide-react";
import { Md, Rico } from "./md";
import type { Pregunta, Unidad } from "../lib/banco";
import { materiaById } from "../lib/domain";
import { cn } from "../lib/utils";

export function rangoGrupo(nums: number[]) {
  if (nums.length <= 1) return `pregunta ${nums[0]}`;
  return `preguntas ${nums[0]} a ${nums[nums.length - 1]}`;
}

/** Texto común de un grupo de preguntas. Siempre se muestra completo. */
export function Contexto({
  u,
  plegable = true,
  abiertoInicial = true,
  className,
}: {
  u: Unidad;
  plegable?: boolean;
  abiertoInicial?: boolean;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  if (!u.contexto && !u.contextoFiguras.length) return null;
  const nums = u.preguntas.map((p) => p.n);
  return (
    <section
      data-testid="contexto"
      className={cn("rounded-lg border-2 border-foreground/80 bg-card", className)}
    >
      <button
        type="button"
        onClick={() => plegable && setAbierto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left"
        aria-expanded={abierto}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          Texto para las {rangoGrupo(nums)}
        </span>
        {plegable && (
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            {abierto ? "Ocultar" : "Ver texto"}
            <ChevronDown className={cn("size-4 transition", abierto && "rotate-180")} />
          </span>
        )}
      </button>
      {abierto && <Rico text={u.contexto} figuras={u.contextoFiguras} className="px-4 py-3 text-[15px]" />}
    </section>
  );
}

export function Burbuja({ l, estado }: { l: string; estado: "nada" | "elegida" | "bien" | "mal" | "correcta" }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border-2 font-mono text-sm font-bold transition",
        estado === "nada" && "border-foreground/40 text-foreground/70",
        estado === "elegida" && "border-foreground bg-foreground text-background",
        estado === "bien" && "border-[#2E7D4F] bg-[#2E7D4F] text-white",
        estado === "correcta" && "border-[#2E7D4F] text-[#2E7D4F]",
        estado === "mal" && "border-accent bg-accent text-white",
      )}
    >
      {estado === "bien" ? <Check className="size-4" strokeWidth={3} /> : estado === "mal" ? <X className="size-4" strokeWidth={3} /> : l}
    </span>
  );
}

export function PreguntaView({
  u,
  q,
  elegida,
  onElegir,
  revelar = false,
  numero,
}: {
  u: Unidad;
  q: Pregunta;
  elegida?: string;
  onElegir?: (l: string | undefined) => void;
  revelar?: boolean;
  numero?: number;
}) {
  const m = materiaById(u.materia);
  return (
    <article data-testid="pregunta">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white"
          style={{ background: m.color }}
        >
          {m.corto}
        </span>
        {numero != null && <span className="font-display text-lg font-bold">Pregunta {numero}</span>}
        <span className="font-mono text-[11px] text-muted-foreground">
          Cuadernillo{u.examen ? ` ${u.examen}` : ""} · nº {q.n}
        </span>
      </div>
      <Rico text={q.enunciado} figuras={q.figuras} className="text-[15.5px]" />
      <div className="mt-4 space-y-2" role="radiogroup">
        {q.opciones.map((o) => {
          const sel = elegida === o.l;
          const estado = revelar
            ? o.l === q.clave
              ? sel
                ? "bien"
                : "correcta"
              : sel
                ? "mal"
                : "nada"
            : sel
              ? "elegida"
              : "nada";
          return (
            <button
              key={o.l}
              type="button"
              role="radio"
              aria-checked={sel}
              data-letra={o.l}
              disabled={!onElegir}
              onClick={() => onElegir?.(sel ? undefined : o.l)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition active:scale-[0.99] disabled:cursor-default",
                sel && !revelar ? "border-foreground shadow-[3px_3px_0_var(--foreground)]" : "border-border hover:border-foreground/60",
                revelar && o.l === q.clave && "border-[#2E7D4F] bg-[#2E7D4F]/[0.06]",
                revelar && sel && o.l !== q.clave && "border-accent bg-accent/[0.06]",
              )}
            >
              <Burbuja l={o.l} estado={estado} />
              <span className="min-w-0 flex-1 pt-1.5 text-[15px]">
                <Rico text={o.t} figuras={o.figuras} />
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function Bloque({
  icon,
  titulo,
  children,
  tono = "neutro",
}: {
  icon: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
  tono?: "neutro" | "rojo" | "verde" | "amarillo";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3.5",
        tono === "neutro" && "border-border bg-card",
        tono === "rojo" && "border-accent/40 bg-accent/[0.05]",
        tono === "verde" && "border-[#2E7D4F]/40 bg-[#2E7D4F]/[0.05]",
        tono === "amarillo" && "border-[#D99A06]/50 bg-[#D99A06]/[0.07]",
      )}
    >
      <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">
        {icon}
        {titulo}
      </p>
      <div className="text-[15px]">{children}</div>
    </div>
  );
}

/** Explicación completa de una pregunta, adaptada a lo que eligió el estudiante. */
export function Explicacion({ q, elegida, temaNombre }: { q: Pregunta; elegida?: string; temaNombre?: string }) {
  const bien = elegida === q.clave;
  const sinExp = !q.explicacion;
  return (
    <div data-testid="explicacion" className="mt-5 space-y-3">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg px-4 py-3 font-semibold",
          bien ? "bg-[#2E7D4F] text-white" : elegida ? "bg-accent text-white" : "bg-foreground text-background",
        )}
      >
        {bien ? <Check className="size-5" strokeWidth={3} /> : <X className="size-5" strokeWidth={3} />}
        <span>
          {bien
            ? `¡Bien! La respuesta es ${q.clave}.`
            : elegida
              ? `Marcaste ${elegida}. La correcta es ${q.clave}.`
              : `No respondiste. La correcta es ${q.clave}.`}
        </span>
      </div>
      {(temaNombre || q.subtema) && (
        <p className="text-sm text-muted-foreground">
          Tema: <b className="text-foreground">{temaNombre}</b>
          {q.subtema ? ` · ${q.subtema}` : ""}
        </p>
      )}
      {sinExp ? (
        <Bloque icon={<Lightbulb className="size-3.5" />} titulo="Explicación">
          <p>La explicación de esta pregunta todavía se está preparando. La respuesta oficial es {q.clave}.</p>
        </Bloque>
      ) : (
        <>
          {q.resumen && <p className="text-[15px] italic text-muted-foreground">{q.resumen}</p>}
          <Bloque icon={<Check className="size-3.5" />} titulo={`Por qué es la ${q.clave}`} tono="verde">
            <Md>{q.explicacion}</Md>
          </Bloque>
          {elegida && !bien && q.porque[elegida] && (
            <Bloque icon={<X className="size-3.5" />} titulo={`Por qué la ${elegida} no es`} tono="rojo">
              <Md>{q.porque[elegida]}</Md>
            </Bloque>
          )}
          {!bien && q.mejorar && (
            <Bloque icon={<Wrench className="size-3.5" />} titulo="Qué debes mejorar" tono="amarillo">
              <Md>{q.mejorar}</Md>
            </Bloque>
          )}
          {q.trampa && (
            <Bloque icon={<TriangleAlert className="size-3.5" />} titulo="La trampa">
              <Md>{q.trampa}</Md>
            </Bloque>
          )}
          {q.estrategia && (
            <Bloque icon={<Target className="size-3.5" />} titulo="Truco para el examen">
              <Md>{q.estrategia}</Md>
            </Bloque>
          )}
          <OtrasOpciones q={q} elegida={elegida} />
        </>
      )}
    </div>
  );
}

function OtrasOpciones({ q, elegida }: { q: Pregunta; elegida?: string }) {
  const [ver, setVer] = useState(false);
  const otras = Object.entries(q.porque).filter(([l]) => l !== q.clave && l !== elegida);
  if (!otras.length) return null;
  return (
    <div className="rounded-lg border border-dashed border-border">
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium"
      >
        Por qué las demás opciones tampoco son
        <ChevronDown className={cn("size-4 transition", ver && "rotate-180")} />
      </button>
      {ver && (
        <ul className="space-y-2 px-3.5 pb-3">
          {otras.map(([l, t]) => (
            <li key={l} className="flex gap-2 text-[15px]">
              <b className="font-mono">{l}.</b>
              <Md className="min-w-0 flex-1">{t}</Md>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
