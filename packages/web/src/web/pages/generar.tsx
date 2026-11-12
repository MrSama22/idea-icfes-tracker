import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Clock, Minus, Plus, Shuffle, Play, BookOpen, Timer as TimerIcon } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import { useDB } from "../hooks/use-store";
import { fmtDur, planear, useBanco } from "../lib/banco";
import { MATERIAS, type MateriaId } from "../lib/domain";
import { store } from "../lib/store";
import { cn } from "../lib/utils";

const PRESETS = [
  { min: 20, label: "20 min" },
  { min: 45, label: "45 min" },
  { min: 60, label: "1 h" },
  { min: 120, label: "2 h" },
  { min: 270, label: "4 h 30", nota: "una sesión real" },
];

export function Cargando({ error }: { error?: string | null }) {
  return (
    <div className="py-20 text-center">
      {error ? (
        <>
          <p className="font-display text-xl font-bold">No se pudieron cargar las preguntas</p>
          <p className="mt-1 text-sm text-muted-foreground">Revisa tu conexión a internet e intenta otra vez.</p>
          <button onClick={() => location.reload()} className="mt-4 rounded-md border border-foreground px-4 py-2 text-sm font-medium">
            Reintentar
          </button>
        </>
      ) : (
        <p className="font-mono text-sm text-muted-foreground">Cargando preguntas…</p>
      )}
    </div>
  );
}

export default function GenerarPage() {
  const { banco, error } = useBanco();
  const db = useDB();
  const [, nav] = useLocation();
  const [materias, setMaterias] = useState<MateriaId[]>(MATERIAS.map((m) => m.id));
  const [min, setMin] = useState(60);
  const [modo, setModo] = useState<"examen" | "practica">("examen");
  const [seed, setSeed] = useState(() => Date.now() % 1e9);

  const vistas = useMemo(() => {
    const s = new Set<string>();
    for (const p of db.practicas ?? []) for (const k of Object.keys(p.respuestas)) s.add(k);
    return s;
  }, [db.practicas]);

  const plan = useMemo(
    () => (banco && materias.length ? planear(banco, materias, min * 60, seed, vistas) : null),
    [banco, materias, min, seed, vistas],
  );

  const toggle = (m: MateriaId) =>
    setMaterias((xs) => (xs.includes(m) ? xs.filter((x) => x !== m) : MATERIAS.map((x) => x.id).filter((x) => x === m || xs.includes(x))));

  const empezar = () => {
    if (!plan || !plan.preguntas) return;
    const nombres = materias.length === MATERIAS.length ? "Todas las materias" : materias.map((m) => MATERIAS.find((x) => x.id === m)!.corto).join(", ");
    const p = store.crearPractica({
      tipo: "simulacro",
      modo,
      nombre: `${nombres} · ${fmtDur(min * 60)}`,
      materias,
      duracionMin: min,
      items: plan.items,
    });
    nav(`/p/${p.id}`);
  };

  const h = Math.floor(min / 60);
  const mm = min % 60;
  const setHM = (nh: number, nm: number) => setMin(Math.max(5, Math.min(600, nh * 60 + nm)));

  return (
    <Shell
      right={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Generar simulacro<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Con preguntas reales de los cuadernillos oficiales del ICFES. Tú eliges el tiempo y las materias; nosotros
        calculamos cuántas preguntas caben y las escogemos al azar.
      </p>

      {!banco ? (
        <Cargando error={error} />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-7">
            <section>
              <SectionTitle
                n="01"
                aside={
                  <button
                    onClick={() => setMaterias(materias.length === MATERIAS.length ? [] : MATERIAS.map((m) => m.id))}
                    className="text-xs font-medium text-accent"
                  >
                    {materias.length === MATERIAS.length ? "Quitar todas" : "Elegir todas"}
                  </button>
                }
              >
                Materias
              </SectionTitle>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {MATERIAS.map((m) => {
                  const on = materias.includes(m.id);
                  const n = banco.unidades.filter((u) => u.materia === m.id).reduce((a, u) => a + u.preguntas.length, 0);
                  return (
                    <button
                      key={m.id}
                      data-testid={`mat-${m.id}`}
                      onClick={() => toggle(m.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border-2 px-3 py-3 text-left transition active:scale-[0.98]",
                        on ? "border-foreground bg-card" : "border-border bg-transparent opacity-60",
                      )}
                    >
                      <span
                        className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 transition")}
                        style={{ borderColor: m.color, background: on ? m.color : "transparent" }}
                      >
                        {on && <span className="size-2 rounded-full bg-white" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{m.nombre}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{n} preguntas</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <SectionTitle n="02">¿Cuánto tiempo tienes?</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.min}
                    onClick={() => setMin(p.min)}
                    className={cn(
                      "rounded-full border-2 px-4 py-2 text-sm font-semibold transition",
                      min === p.min ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
                    )}
                  >
                    {p.label}
                    {p.nota && <span className="ml-1 font-normal opacity-70">· {p.nota}</span>}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-4 rounded-lg border border-border bg-card p-3">
                <Clock className="size-5 shrink-0 text-muted-foreground" />
                <Stepper label="horas" value={h} onChange={(v) => setHM(v, mm)} step={1} />
                <Stepper label="minutos" value={mm} onChange={(v) => (v >= 60 ? setHM(h + 1, 0) : v < 0 ? setHM(h - 1, 55) : setHM(h, v))} step={5} />
              </div>
            </section>

            <section>
              <SectionTitle n="03">¿Cómo quieres hacerlo?</SectionTitle>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ModoBtn
                  on={modo === "examen"}
                  onClick={() => setModo("examen")}
                  icon={<TimerIcon className="size-5" />}
                  titulo="Como el examen real"
                  texto="Con cronómetro. Ves las respuestas y explicaciones al final."
                />
                <ModoBtn
                  on={modo === "practica"}
                  onClick={() => setModo("practica")}
                  icon={<BookOpen className="size-5" />}
                  titulo="Practicar con ayuda"
                  texto="Después de cada respuesta te explicamos si está bien y por qué."
                />
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_var(--foreground)]">
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Tu simulacro</p>
              {!materias.length ? (
                <p className="mt-3 text-sm">Elige al menos una materia.</p>
              ) : plan ? (
                <>
                  <p className="mt-2 flex items-baseline gap-2">
                    <span data-testid="plan-total" className="font-display text-6xl font-extrabold leading-none">
                      {plan.preguntas}
                    </span>
                    <span className="text-lg font-semibold">preguntas</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    en {fmtDur(min * 60)}
                    {plan.todo && " · son todas las del banco para esas materias"}
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {materias.map((m) => {
                      const mt = MATERIAS.find((x) => x.id === m)!;
                      const n = plan.porMateria[m] ?? 0;
                      return (
                        <li key={m} className="flex items-center gap-2 text-sm">
                          <span className="size-2.5 rounded-full" style={{ background: mt.color }} />
                          <span className="flex-1">{mt.nombre}</span>
                          <span className="font-mono font-semibold">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                    Calculado a ritmo de examen real (≈2 min por pregunta, más el tiempo de leer los textos). Las
                    preguntas que comparten un texto salen juntas y siempre con su texto.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setSeed((s) => s + 1)}
                      className="inline-flex h-12 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:border-foreground"
                      title="Escoger otras preguntas"
                    >
                      <Shuffle className="size-4" /> Otras
                    </button>
                    <button
                      data-testid="empezar"
                      disabled={!plan.preguntas}
                      onClick={empezar}
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-40"
                    >
                      <Play className="size-4 fill-current" /> Empezar
                    </button>
                  </div>
                  {!plan.preguntas && <p className="mt-2 text-xs text-accent">Ese tiempo es muy corto. Sube unos minutos.</p>}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </Shell>
  );
}

function Stepper({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <div className="flex items-center gap-2">
      <button
        aria-label={`Menos ${label}`}
        onClick={() => onChange(value - step)}
        className="grid size-10 place-items-center rounded-md border border-border bg-background hover:border-foreground"
      >
        <Minus className="size-4" />
      </button>
      <div className="w-14 text-center">
        <div className="font-display text-2xl font-bold leading-none">{value}</div>
        <div className="font-mono text-[10px] uppercase text-muted-foreground">{label}</div>
      </div>
      <button
        aria-label={`Más ${label}`}
        onClick={() => onChange(value + step)}
        className="grid size-10 place-items-center rounded-md border border-border bg-background hover:border-foreground"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function ModoBtn({ on, onClick, icon, titulo, texto }: { on: boolean; onClick: () => void; icon: React.ReactNode; titulo: string; texto: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex gap-3 rounded-lg border-2 p-3.5 text-left transition",
        on ? "border-foreground bg-card" : "border-border opacity-70 hover:opacity-100",
      )}
    >
      <span className={cn("mt-0.5", on && "text-accent")}>{icon}</span>
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="text-sm text-muted-foreground">{texto}</span>
      </span>
    </button>
  );
}
