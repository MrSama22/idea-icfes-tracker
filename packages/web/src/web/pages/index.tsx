import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Download, FileUp, Plus, Trash2 } from "lucide-react";
import { Shell, SectionTitle, GhostButton } from "../components/shell";
import { Evolucion, TendenciaMaterias } from "../components/charts";
import { useDB } from "../hooks/use-store";
import { store } from "../lib/store";
import { MATERIAS, defaultPreguntas, fmtClock, elapsedMs, type MateriaId } from "../lib/domain";
import { estadisticas } from "../lib/analytics";
import { download, erroresCSV } from "../lib/export";

const DURACIONES = [
  { label: "Sesión 1 · 4h 30m", min: 270 },
  { label: "Sesión 2 · 4h 30m", min: 270 },
  { label: "Bloque 1h", min: 60 },
  { label: "Bloque 2h", min: 120 },
];

function NuevoSimulacro() {
  const db = useDB();
  const [, navigate] = useLocation();
  const [nombre, setNombre] = useState("");
  const [duracion, setDuracion] = useState(270);
  const [abierto, setAbierto] = useState(false);
  const [preguntas, setPreguntas] = useState<Record<MateriaId, number>>(defaultPreguntas());

  const crear = () => {
    const s = store.crearSimulacro({
      nombre: nombre || `Simulacro ${db.simulacros.length + 1}`,
      duracionMin: duracion,
      preguntas,
    });
    navigate(`/s/${s.id}`);
  };

  return (
    <div className="rise rounded-lg border-2 border-foreground bg-card p-4 shadow-[4px_4px_0_0_var(--foreground)] sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
        Nuevo simulacro
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && crear()}
          placeholder={`Simulacro ${db.simulacros.length + 1}`}
          className="h-12 flex-1 rounded-md border border-border bg-background px-3 text-base outline-none focus:border-foreground"
        />
        <select
          value={duracion}
          onChange={(e) => setDuracion(Number(e.target.value))}
          className="h-12 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
        >
          {DURACIONES.map((d) => (
            <option key={d.label} value={d.min}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          onClick={crear}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent px-5 font-semibold text-accent-foreground transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="size-4" /> Empezar
        </button>
      </div>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {abierto ? "Ocultar" : "Ajustar"} preguntas por materia (para % de acierto)
      </button>
      {abierto && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {MATERIAS.map((m) => (
            <label key={m.id} className="text-xs text-muted-foreground">
              {m.corto}
              <input
                type="number"
                min={0}
                value={preguntas[m.id]}
                onChange={(e) =>
                  setPreguntas((p) => ({ ...p, [m.id]: Math.max(0, Number(e.target.value)) }))
                }
                className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 font-mono text-sm text-foreground outline-none focus:border-foreground"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Respaldo() {
  const db = useDB();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onFile = async (f: File) => {
    try {
      const txt = await f.text();
      const reemplazar =
        db.simulacros.length > 0
          ? !confirm("¿Combinar con tus datos actuales? (Cancelar = reemplazar todo)")
          : true;
      store.importar(txt, reemplazar ? "reemplazar" : "combinar");
      setMsg("Datos importados.");
    } catch {
      setMsg("No se pudo leer el archivo.");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <GhostButton
        onClick={() =>
          download(
            `idea-respaldo-${new Date().toISOString().slice(0, 10)}.json`,
            store.exportar(),
            "application/json",
          )
        }
      >
        <Download className="size-4" /> Respaldo JSON
      </GhostButton>
      <GhostButton onClick={() => input.current?.click()}>
        <FileUp className="size-4" /> Importar
      </GhostButton>
      <GhostButton
        disabled={!db.errores.length}
        onClick={() =>
          download(
            "idea-todos-los-errores.csv",
            erroresCSV(db.simulacros, db.errores),
            "text/csv;charset=utf-8",
          )
        }
      >
        <Download className="size-4" /> CSV global
      </GhostButton>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}

export default function Index() {
  const db = useDB();

  return (
    <Shell>
      <section className="grid gap-6 pb-8 pt-4 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div className="rise">
          <h1 className="font-display text-[2.6rem] font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            Cada error es
            <br />
            <span className="relative inline-block">
              un dato.
              <svg
                className="absolute -bottom-2 left-0 w-full"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
                aria-hidden
              >
                <path
                  d="M2 8 C 50 2, 120 12, 198 4"
                  stroke="#E2401C"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Registra tus fallos del simulacro en un toque, clasifícalos por causa y descubre dónde
            estás perdiendo puntaje en el ICFES.
          </p>
        </div>
        <NuevoSimulacro />
      </section>

      <section className="mb-10">
        <SectionTitle
          n="01"
          aside={
            <span className="font-mono text-xs text-muted-foreground">
              {db.simulacros.length} en total
            </span>
          }
        >
          Tus simulacros
        </SectionTitle>
        {db.simulacros.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aún no hay simulacros. Crea el primero arriba y empieza a registrar.
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {db.simulacros.map((s, i) => {
              const errs = db.errores.filter((e) => e.simulacroId === s.id);
              const st = estadisticas(s, errs);
              const top = MATERIAS.map((m) => ({ m, n: st.porMateria[m.id] })).sort(
                (a, b) => b.n - a.n,
              )[0];
              return (
                <li
                  key={s.id}
                  className="rise group relative"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <Link
                    to={`/s/${s.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 py-3.5 pr-10 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{s.nombre}</span>
                        {s.iniciadoEn && (
                          <span
                            className="size-2 animate-pulse rounded-full bg-accent"
                            title="En curso"
                          />
                        )}
                        {s.finalizado && (
                          <span className="rounded-[3px] bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                            Finalizado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.fecha).toLocaleDateString("es-CO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}{" "}
                        · {fmtClock(elapsedMs(s))}
                      </div>
                    </div>
                    <div className="text-right sm:text-left">
                      <span className="font-display text-2xl font-bold tnum">{st.total}</span>
                      <span className="ml-1 text-xs text-muted-foreground">errores</span>
                    </div>
                    <div className="hidden text-sm sm:block">
                      {st.aciertoEstimado != null && (
                        <>
                          <span className="font-mono font-semibold">{st.aciertoEstimado}%</span>
                          <span className="ml-1 text-xs text-muted-foreground">acierto est.</span>
                        </>
                      )}
                    </div>
                    <div className="hidden truncate text-sm text-muted-foreground sm:block">
                      {top.n ? `Débil: ${top.m.corto}` : "—"}
                    </div>
                    <ArrowRight className="hidden size-4 transition group-hover:translate-x-1 sm:block" />
                  </Link>
                  <button
                    aria-label="Eliminar simulacro"
                    onClick={() =>
                      confirm(`¿Eliminar “${s.nombre}” y sus ${errs.length} errores?`) &&
                      store.eliminarSimulacro(s.id)
                    }
                    className="absolute right-0 top-1/2 -translate-y-1/2 rounded p-2 text-muted-foreground opacity-60 transition hover:text-accent hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle n="02">Evolución entre simulacros</SectionTitle>
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="rounded-lg border border-border bg-card p-4">
            <Evolucion simulacros={db.simulacros} errores={db.errores} />
          </div>
          <div className="space-y-2">
            {db.simulacros.length >= 2 && (
              <p className="text-xs text-muted-foreground">
                Último simulacro vs. el anterior, por materia
              </p>
            )}
            <TendenciaMaterias simulacros={db.simulacros} errores={db.errores} />
          </div>
        </div>
      </section>

      <section>
        <SectionTitle n="03">Tus datos</SectionTitle>
        <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
          Todo se guarda en este dispositivo. Usa el respaldo JSON para pasar tus datos entre el
          celular y el PC o para no perderlos.
        </p>
        <Respaldo />
      </section>
    </Shell>
  );
}
