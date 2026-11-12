import { useMemo } from "react";
import { Link, useParams } from "wouter";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { Shell, GhostButton } from "../components/shell";
import { Diagnostico, Heatmap, MateriaBars, TipoSplit } from "../components/charts";
import { useSimulacro } from "../hooks/use-store";
import { useAnterior } from "./simulacro";
import { diagnostico, estadisticas } from "../lib/analytics";
import { MATERIAS, elapsedMs, fmtClock, materiaById, tipoById } from "../lib/domain";
import { download, erroresCSV, slug } from "../lib/export";

export default function ReportePage() {
  const { id } = useParams<{ id: string }>();
  const { simulacro: s, errores } = useSimulacro(id);
  const anterior = useAnterior(id);
  const st = useMemo(() => estadisticas(s, errores), [s, errores]);
  const diag = useMemo(() => diagnostico(s, errores, anterior), [s, errores, anterior]);

  if (!s)
    return (
      <Shell>
        <p className="py-20 text-center">Simulacro no encontrado.</p>
      </Shell>
    );

  const ordenados = [...errores].sort((a, b) =>
    a.materia === b.materia
      ? a.numeroPregunta - b.numeroPregunta
      : MATERIAS.findIndex((m) => m.id === a.materia) -
        MATERIAS.findIndex((m) => m.id === b.materia),
  );

  return (
    <Shell
      right={
        <>
          <GhostButton
            onClick={() =>
              download(
                `idea-${slug(s.nombre)}.csv`,
                erroresCSV([s], errores),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download className="size-4" /> CSV
          </GhostButton>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
          >
            <Printer className="size-4" /> PDF
          </button>
        </>
      }
    >
      <div className="no-print mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to={`/s/${s.id}`} className="inline-flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="size-4" /> Volver al simulacro
        </Link>
        <span className="hidden sm:inline">· Para PDF: “Imprimir” → “Guardar como PDF”.</span>
      </div>

      <article className="print-page mx-auto max-w-3xl rounded-lg border border-border bg-white p-6 shadow-sm sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b-2 border-foreground pb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Reporte de diagnóstico · IDEA
            </p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">{s.nombre}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(s.fecha).toLocaleDateString("es-CO", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · Tiempo usado {fmtClock(elapsedMs(s))} de {Math.floor(s.duracionMin / 60)}h{" "}
              {s.duracionMin % 60}m
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-5xl font-extrabold leading-none tnum">{st.total}</div>
            <div className="text-xs text-muted-foreground">errores</div>
            {st.aciertoEstimado != null && (
              <div className="mt-1 font-mono text-sm font-semibold">
                {st.aciertoEstimado}% acierto est.
              </div>
            )}
          </div>
        </header>

        <section className="mt-6 break-inside-avoid">
          <h2 className="mb-3 font-display text-lg font-bold">Diagnóstico</h2>
          <Diagnostico items={diag} />
        </section>

        <section className="mt-8 grid gap-8 sm:grid-cols-2">
          <div className="break-inside-avoid">
            <h2 className="mb-3 font-display text-lg font-bold">Errores por materia</h2>
            <MateriaBars st={st} />
          </div>
          <div className="break-inside-avoid">
            <h2 className="mb-3 font-display text-lg font-bold">Por tipo de error</h2>
            <TipoSplit st={st} />
            <h3 className="mb-2 mt-5 text-sm font-semibold">Acierto estimado por materia</h3>
            <ul className="space-y-1 text-sm">
              {MATERIAS.map((m) => (
                <li
                  key={m.id}
                  className="flex justify-between border-b border-dashed border-border py-0.5"
                >
                  <span>{m.nombre}</span>
                  <span className="font-mono font-semibold">
                    {st.aciertoPorMateria[m.id] != null ? `${st.aciertoPorMateria[m.id]}%` : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-3 font-display text-lg font-bold">Materia × tipo</h2>
          <Heatmap st={st} />
        </section>

        <section className="mt-8">
          <h2 className="mb-3 font-display text-lg font-bold">Detalle de errores</h2>
          {ordenados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin errores registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-foreground text-left font-mono text-[10px] uppercase tracking-wider">
                  <th className="py-1.5">Materia</th>
                  <th className="py-1.5">Preg.</th>
                  <th className="py-1.5">Tipo</th>
                  <th className="py-1.5">Min</th>
                  <th className="py-1.5">Nota</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((e) => (
                  <tr key={e.id} className="break-inside-avoid border-b border-border">
                    <td className="py-1.5">{materiaById(e.materia).corto}</td>
                    <td className="py-1.5 font-mono font-semibold">{e.numeroPregunta}</td>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <i
                          className="size-2 rounded-[2px]"
                          style={{ background: tipoById(e.tipo).color }}
                        />
                        {tipoById(e.tipo).corto}
                      </span>
                    </td>
                    <td className="py-1.5 font-mono text-xs">{e.minuto ?? "—"}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">{e.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <footer className="mt-10 border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
          Generado con IDEA · ICFES Diagnostic & Error Analytics Engine ·{" "}
          {new Date().toLocaleString("es-CO")}
        </footer>
      </article>
    </Shell>
  );
}
