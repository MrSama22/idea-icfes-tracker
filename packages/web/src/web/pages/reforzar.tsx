import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowRight, Check, ChevronLeft, Lightbulb, ListChecks, Play, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import { Md } from "../components/md";
import { Burbuja } from "../components/pregunta";
import { Cargando } from "./generar";
import { useDB } from "../hooks/use-store";
import {
  ilus,
  itemsDesdeClaves,
  mezclar,
  ordenarPorDificultad,
  preguntasDeTema,
  statsTemas,
  useBanco,
  type TemaStat,
} from "../lib/banco";
import { MATERIAS, materiaById, pct } from "../lib/domain";
import { store } from "../lib/store";
import { cn } from "../lib/utils";

function useStats() {
  const { banco, error } = useBanco();
  const db = useDB();
  const stats = useMemo(() => (banco ? statsTemas(banco, db.practicas ?? []) : null), [banco, db.practicas]);
  return { banco, error, stats };
}

function Medidor({ s }: { s: TemaStat }) {
  if (!s.vistas) return <span className="font-mono text-[11px] text-muted-foreground">Sin practicar</span>;
  const x = pct(s.bien, s.vistas);
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${x}%`, background: x >= 70 ? "#2E7D4F" : x >= 40 ? "#D99A06" : "#E2401C" }} />
      </span>
      <span className="font-mono text-[11px]">
        {s.bien}/{s.vistas}
      </span>
    </span>
  );
}

function TemaCard({ s, grande }: { s: TemaStat; grande?: boolean }) {
  const m = materiaById(s.tema.materia);
  return (
    <Link
      to={`/reforzar/${s.tema.id}`}
      data-testid={`tema-${s.tema.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border-2 border-border bg-card transition hover:-translate-y-0.5 hover:border-foreground"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        <img src={ilus(s.tema.id)} alt="" loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
        <span className="absolute left-2 top-2 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-white" style={{ background: m.color }}>
          {m.corto}
        </span>
        {s.mal > 0 && (
          <span className="absolute right-2 top-2 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
            {s.mal} fallo{s.mal === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className={cn("font-display font-bold leading-tight", grande ? "text-lg" : "text-[15px]")}>{s.tema.nombre}</p>
        {grande && <p className="line-clamp-2 text-sm text-muted-foreground">{s.tema.desc}</p>}
        <div className="mt-auto flex items-center justify-between">
          <Medidor s={s} />
          <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

export function ReforzarPage() {
  const { banco, error, stats } = useStats();
  const [mat, setMat] = useState<string>("todas");
  if (!banco || !stats) return <Shell><Cargando error={error} /></Shell>;
  const todas = [...stats.values()];
  const dificiles = ordenarPorDificultad(todas.filter((s) => s.mal > 0)).slice(0, 3);
  const visibles = todas.filter((s) => mat === "todas" || s.tema.materia === mat);

  return (
    <Shell
      right={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Reforzar<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Lecciones cortas, con ejemplos resueltos y práctica con preguntas reales. Empieza por lo que más se te dificulta.
      </p>

      <section className="mt-6">
        <SectionTitle n="01">Lo que más se te dificulta</SectionTitle>
        {dificiles.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dificiles.map((s) => (
              <TemaCard key={s.tema.id} s={s} grande />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-border p-5 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm">
              Aún no sabemos qué se te dificulta. Haz un simulacro y aquí aparecerán los temas que más fallas.
            </p>
            <Link to="/generar" className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white">
              <Play className="size-4 fill-current" /> Generar simulacro
            </Link>
          </div>
        )}
      </section>

      <section className="mt-8">
        <SectionTitle n="02">Todos los temas</SectionTitle>
        <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[{ id: "todas", corto: "Todas" }, ...MATERIAS].map((m) => (
            <button
              key={m.id}
              onClick={() => setMat(m.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium",
                mat === m.id ? "border-foreground bg-foreground text-background" : "border-border",
              )}
            >
              {m.corto}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {visibles.map((s) => (
            <TemaCard key={s.tema.id} s={s} />
          ))}
        </div>
      </section>
    </Shell>
  );
}

function MiniPregunta({
  enunciado,
  opciones,
  correcta,
  explicacion,
  n,
}: {
  enunciado: string;
  opciones: Record<string, string>;
  correcta: string;
  explicacion: string;
  n?: number;
}) {
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {n != null && <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Ejercicio {n}</p>}
      <Md className="text-[15px]">{enunciado}</Md>
      <div className="mt-3 space-y-2">
        {Object.entries(opciones).map(([l, t]) => {
          const estado = !sel ? "nada" : l === correcta ? (sel === l ? "bien" : "correcta") : sel === l ? "mal" : "nada";
          return (
            <button
              key={l}
              disabled={!!sel}
              onClick={() => setSel(l)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition disabled:cursor-default",
                sel && l === correcta ? "border-[#2E7D4F] bg-[#2E7D4F]/[0.06]" : sel === l ? "border-accent bg-accent/[0.06]" : "border-border hover:border-foreground/60",
              )}
            >
              <Burbuja l={l} estado={estado} />
              <Md className="min-w-0 flex-1 text-[15px]">{t}</Md>
            </button>
          );
        })}
      </div>
      {sel && (
        <div className={cn("mt-3 rounded-lg p-3 text-[15px]", sel === correcta ? "bg-[#2E7D4F]/10" : "bg-accent/10")}>
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            {sel === correcta ? <Check className="size-4" /> : <X className="size-4" />}
            {sel === correcta ? "¡Correcto!" : `La respuesta es ${correcta}.`}
          </p>
          <Md>{explicacion}</Md>
          {sel !== correcta && (
            <button onClick={() => setSel(null)} className="mt-2 text-sm font-medium underline">
              Intentar de nuevo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TemaPage() {
  const { tema: tid } = useParams<{ tema: string }>();
  const [, nav] = useLocation();
  const { banco, error, stats } = useStats();
  if (!banco || !stats) return <Shell><Cargando error={error} /></Shell>;
  const s = stats.get(tid);
  if (!s) return <Shell><p className="py-20 text-center">Tema no encontrado.</p></Shell>;
  const t = s.tema;
  const m = materiaById(t.materia);
  const lec = banco.lecciones[tid];
  const reales = preguntasDeTema(banco, tid);
  const nReales = reales.reduce((a, x) => a + x.qs.length, 0);

  const practicar = (items: typeof reales, nombre: string, max = 10) => {
    // Mezcla y limita sin partir grupos
    const elegidos: typeof reales = [];
    let n = 0;
    for (const it of mezclar(items)) {
      if (n >= max) break;
      elegidos.push(it);
      n += it.qs.length;
    }
    const p = store.crearPractica({ tipo: "tema", modo: "practica", nombre, temaId: tid, materias: [t.materia], duracionMin: 0, items: elegidos });
    nav(`/p/${p.id}`);
  };

  return (
    <Shell
      right={
        <Link to="/reforzar" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Temas
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.1fr_1fr] md:items-center">
        <div className="overflow-hidden rounded-2xl border-2 border-foreground">
          <img src={ilus(tid)} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>
        <div>
          <span className="rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-white" style={{ background: m.color }}>
            {m.nombre}
          </span>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{t.nombre}</h1>
          <p className="mt-2 text-muted-foreground">{t.desc}</p>
          <div className="mt-3">
            <Medidor s={s} />
          </div>
        </div>
      </div>

      {lec ? (
        <div className="mx-auto mt-8 max-w-3xl space-y-8">
          <section>
            <Md className="text-[17px]">{lec.gancho}</Md>
            <div className="mt-4 flex gap-3 rounded-xl border-2 border-foreground bg-[#D99A06]/15 p-4">
              <Lightbulb className="mt-0.5 size-6 shrink-0 text-[#a87500]" />
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em]">La idea clave</p>
                <Md className="mt-1 font-display text-lg font-semibold leading-snug">{lec.idea_clave}</Md>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle n="01">Paso a paso</SectionTitle>
            <ol className="space-y-3">
              {lec.pasos.map((p, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground font-display font-bold text-background">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-bold">{p.titulo}</p>
                    <Md className="mt-1 text-[15px]">{p.texto}</Md>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <SectionTitle n="02">Ejemplo resuelto</SectionTitle>
            <MiniPregunta
              enunciado={lec.ejemplo.enunciado}
              opciones={lec.ejemplo.opciones}
              correcta={lec.ejemplo.correcta}
              explicacion={lec.ejemplo.solucion}
            />
            <p className="mt-2 text-xs text-muted-foreground">Intenta responder antes de ver la solución.</p>
          </section>

          <section>
            <SectionTitle n="03">Errores típicos</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {lec.errores.map((e, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start gap-2 font-semibold">
                    <TriangleAlert className="mt-1 size-4 shrink-0 text-accent" />
                    <Md className="min-w-0 flex-1">{e.error}</Md>
                  </div>
                  <Md className="mt-2 text-sm text-muted-foreground">{e.como_evitarlo}</Md>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle n="04">Mini práctica</SectionTitle>
            <div className="space-y-3">
              {lec.practica.map((q, i) => (
                <MiniPregunta key={i} n={i + 1} {...q} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border-2 border-foreground bg-card p-5">
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              <ListChecks className="size-5 text-accent" /> Para recordar el día del examen
            </p>
            <ul className="mt-3 space-y-2">
              {lec.recordar.map((r, i) => (
                <li key={i} className="flex gap-2 text-[15px]">
                  <Check className="mt-1 size-4 shrink-0 text-[#2E7D4F]" />
                  <Md className="min-w-0 flex-1">{r}</Md>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <p className="mx-auto mt-8 max-w-3xl rounded-xl border border-dashed border-border p-5 text-sm">
          La lección de este tema se está preparando. Mientras tanto puedes practicar con preguntas reales.
        </p>
      )}

      <section className="mx-auto mt-8 max-w-3xl">
        <SectionTitle n="05">Practica con preguntas reales del ICFES</SectionTitle>
        <p className="text-sm text-muted-foreground">
          Hay {nReales} preguntas de los cuadernillos oficiales sobre este tema. Te explicamos cada una apenas respondas.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            data-testid="practicar-tema"
            disabled={!nReales}
            onClick={() => practicar(reales, `Práctica · ${t.nombre}`)}
            className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-white disabled:opacity-40"
          >
            <Play className="size-4 fill-current" /> Practicar {Math.min(10, nReales)} preguntas
          </button>
          {s.fallos.length > 0 && (
            <button
              onClick={() => practicar(itemsDesdeClaves(s.fallos), `Mis fallos · ${t.nombre}`, 99)}
              className="inline-flex h-12 items-center gap-2 rounded-md border-2 border-foreground px-5 font-semibold"
            >
              <RotateCcw className="size-4" /> Repetir mis {s.fallos.length} fallos
            </button>
          )}
        </div>
      </section>
    </Shell>
  );
}
