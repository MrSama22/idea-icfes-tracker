import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { ChevronLeft, FileText, Pencil } from "lucide-react";
import { Shell, SectionTitle, GhostButton } from "../components/shell";
import { CapturePanel, Timer } from "../components/capture";
import { ErrorTable } from "../components/error-table";
import { Diagnostico, Heatmap, MateriaBars, TiempoCuartos, TipoSplit } from "../components/charts";
import { useSimulacro } from "../hooks/use-store";
import { diagnostico, estadisticas } from "../lib/analytics";
import { store } from "../lib/store";

export function useAnterior(id: string) {
  const { db, simulacro } = useSimulacro(id);
  return useMemo(() => {
    if (!simulacro) return undefined;
    const prev = [...db.simulacros]
      .filter((s) => s.creadoEn < simulacro.creadoEn)
      .sort((a, b) => b.creadoEn - a.creadoEn)[0];
    return prev
      ? { simulacro: prev, errores: db.errores.filter((e) => e.simulacroId === prev.id) }
      : undefined;
  }, [db, simulacro]);
}

export default function SimulacroPage() {
  const { id } = useParams<{ id: string }>();
  const { simulacro: s, errores } = useSimulacro(id);
  const anterior = useAnterior(id);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [tab, setTab] = useState<"registro" | "analisis">("registro");
  const st = useMemo(() => estadisticas(s, errores), [s, errores]);
  const diag = useMemo(() => diagnostico(s, errores, anterior), [s, errores, anterior]);

  if (!s) {
    return (
      <Shell>
        <div className="py-20 text-center">
          <p className="font-display text-2xl font-bold">Simulacro no encontrado</p>
          <Link to="/" className="mt-3 inline-block text-sm text-accent underline">
            Volver al inicio
          </Link>
        </div>
      </Shell>
    );
  }

  const renombrar = () => {
    const v = prompt("Nombre del simulacro", s.nombre);
    if (v?.trim()) store.actualizarSimulacro(s.id, { nombre: v.trim() });
  };

  const analisis = (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
        <Stat label="Errores" value={st.total} />
        <Stat
          label="Acierto est."
          value={st.aciertoEstimado != null ? `${st.aciertoEstimado}%` : "—"}
        />
        <Stat
          label="vs. anterior"
          value={
            anterior
              ? (() => {
                  const d = st.total - anterior.errores.length;
                  return d === 0 ? "=" : d > 0 ? `+${d}` : `${d}`;
                })()
              : "—"
          }
        />
      </div>
      <div>
        <SectionTitle n="A">Diagnóstico</SectionTitle>
        <Diagnostico items={diag} />
      </div>
      <div>
        <SectionTitle n="B">Dónde sangras puntaje</SectionTitle>
        <MateriaBars st={st} />
      </div>
      <div>
        <SectionTitle n="C">Por tipo de error</SectionTitle>
        <TipoSplit st={st} />
      </div>
      <div>
        <SectionTitle n="D">Materia × tipo</SectionTitle>
        <Heatmap st={st} />
      </div>
      <div>
        <SectionTitle n="E">Errores a lo largo del tiempo</SectionTitle>
        <TiempoCuartos st={st} />
      </div>
    </div>
  );

  return (
    <Shell
      right={
        <Link to={`/s/${s.id}/reporte`}>
          <GhostButton>
            <FileText className="size-4" /> <span className="hidden sm:inline">Reporte</span>
          </GhostButton>
        </Link>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <Link
          to="/"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Volver"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <button onClick={renombrar} className="group flex min-w-0 items-center gap-2 text-left">
          <h1 className="truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {s.nombre}
          </h1>
          <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </button>
        {s.finalizado && (
          <span className="shrink-0 rounded-[3px] bg-foreground px-1.5 py-0.5 font-mono text-[10px] uppercase text-background">
            Finalizado
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
            <Timer s={s} />
            <div className="mt-4">
              <CapturePanel s={s} errores={errores} onRegistrado={setHighlight} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1 lg:hidden">
            {(["registro", "analisis"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`h-9 rounded-[5px] text-sm font-semibold transition ${tab === t ? "bg-card shadow-[0_1px_0_1px_var(--border)]" : "text-muted-foreground"}`}
              >
                {t === "registro" ? `Registro (${errores.length})` : "Análisis"}
              </button>
            ))}
          </div>

          <div className={`mt-4 ${tab === "registro" ? "" : "hidden lg:block"}`}>
            <SectionTitle
              n="01"
              aside={
                <span className="font-mono text-xs text-muted-foreground">
                  {errores.length} errores
                </span>
              }
            >
              Registro en vivo
            </SectionTitle>
            <ErrorTable errores={errores} highlight={highlight} />
          </div>
          <div className={`mt-4 lg:hidden ${tab === "analisis" ? "" : "hidden"}`}>{analisis}</div>
        </div>

        <aside className="hidden lg:block">{analisis}</aside>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-display text-3xl font-bold tnum">{value}</div>
    </div>
  );
}
