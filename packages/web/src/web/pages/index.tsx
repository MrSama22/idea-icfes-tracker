import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Download, FileUp, GraduationCap, Plus, Sparkles, Trash2 } from "lucide-react";
import { Shell, SectionTitle, GhostButton } from "../components/shell";
import { Evolucion, TendenciaMaterias } from "../components/charts";
import { useDB } from "../hooks/use-store";
import { store } from "../lib/store";
import { MATERIAS, defaultPreguntas, fmtClock, elapsedMs, type MateriaId } from "../lib/domain";
import { estadisticas } from "../lib/analytics";
import { download, erroresCSV } from "../lib/export";
import { useInstall } from "../lib/pwa";
import { Smartphone, ShieldCheck, RefreshCw, Cloud, CloudOff, Copy, Check, Laptop } from "lucide-react";
import { useSync, sync, sincronizar, formatear, codigoValido } from "../lib/sync";

function hace(t: number | null) {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return new Date(t).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Sincronizar() {
  const st = useSync();
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const correr = async (fn: () => Promise<void>) => {
    setError(null);
    setCargando(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setCargando(false);
    }
  };

  if (!st.codigo) {
    return (
      <div className="mt-3 rounded-lg border-2 border-foreground bg-card p-4">
        <div className="flex items-start gap-3">
          <Laptop className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Ver tus datos en el celular y en el PC</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Activa la sincronización en un dispositivo y te damos un código. Escribe ese mismo código en el otro y
              los dos tendrán siempre los mismos datos. No necesitas cuenta ni contraseña.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Paso 1 · Aquí</p>
            <p className="mt-1 text-sm">¿Es el primer dispositivo? Crea tu código.</p>
            <button
              disabled={cargando}
              onClick={() => correr(() => sync.activar())}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              <Cloud className="size-4" /> Activar sincronización
            </button>
          </div>
          <div className="rounded-md border border-border bg-background p-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-accent">Paso 2 · En el otro</p>
            <p className="mt-1 text-sm">¿Ya tienes un código? Escríbelo aquí.</p>
            <div className="mt-3 flex gap-2">
              <input
                value={codigo}
                onChange={(e) => setCodigo(formatear(e.target.value).slice(0, 14))}
                onKeyDown={(e) => e.key === "Enter" && codigoValido(codigo) && correr(() => sync.conectar(codigo))}
                placeholder="XXXX-XXXX-XXXX"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-label="Código de sincronización"
                className="h-11 min-w-0 flex-1 rounded-md border border-border bg-card px-3 font-mono text-base uppercase tracking-wider outline-none focus:border-foreground"
              />
              <button
                disabled={cargando || !codigoValido(codigo)}
                onClick={() => correr(() => sync.conectar(codigo))}
                className="h-11 rounded-md bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40"
              >
                Conectar
              </button>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-accent">{error}</p>}
      </div>
    );
  }

  const icono =
    st.estado === "sin-conexion" || st.estado === "error" ? (
      <CloudOff className="size-5 shrink-0 text-accent" />
    ) : (
      <Cloud className="size-5 shrink-0 text-[#2E7D4F]" />
    );
  const texto =
    st.estado === "sincronizando"
      ? "Sincronizando…"
      : st.estado === "ok"
        ? `Sincronizado ${hace(st.ultima)}`
        : (st.mensaje ?? "Pendiente de sincronizar");

  return (
    <div className="mt-3 rounded-lg border-2 border-foreground bg-card p-4">
      <div className="flex items-start gap-3">
        {icono}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Sincronización activada</p>
          <p className="mt-0.5 text-sm text-muted-foreground" data-testid="sync-estado">
            {texto}. Para ver tus datos en otro dispositivo, abre la app allí y escribe este código:
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code
          data-testid="sync-codigo"
          className="select-all rounded-md border border-dashed border-foreground bg-background px-3 py-2 font-mono text-xl font-bold tracking-[0.12em]"
        >
          {formatear(st.codigo)}
        </code>
        <GhostButton
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(formatear(st.codigo!));
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            } catch {
              /* sin portapapeles */
            }
          }}
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? "Copiado" : "Copiar"}
        </GhostButton>
        <GhostButton disabled={st.estado === "sincronizando"} onClick={() => void sincronizar()}>
          <RefreshCw className={`size-4 ${st.estado === "sincronizando" ? "animate-spin" : ""}`} /> Sincronizar ahora
        </GhostButton>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Guarda este código como una contraseña: quien lo tenga puede ver tus datos. Los cambios se envían solos
        cuando hay internet; sin conexión todo sigue guardado aquí.{" "}
        <button
          className="underline underline-offset-2 hover:text-accent"
          onClick={() =>
            confirm("¿Dejar de sincronizar este dispositivo? Tus datos se quedan aquí, pero ya no se actualizarán con el otro.") &&
            sync.desconectar()
          }
        >
          Desconectar este dispositivo
        </button>
      </p>
    </div>
  );
}

function Guardado() {
  const db = useDB();
  const { instalada, puedeInstalar, ios, instalar } = useInstall();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#2E7D4F]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Tus datos se guardan en este dispositivo</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {db.simulacros.length} simulacros y {db.errores.length} errores guardados aquí. Se conservan aunque cierres la app o
            apagues el celular, y funciona sin internet. Solo se pierden si borras los datos del navegador.
          </p>
        </div>
      </div>
      {!instalada && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Smartphone className="size-5 shrink-0" />
          {puedeInstalar ? (
            <>
              <span className="flex-1 text-sm">Instálala en tu celular como una app, con icono propio.</span>
              <button onClick={instalar} className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">
                Instalar app
              </button>
            </>
          ) : ios ? (
            <span className="flex-1 text-sm">
              Para instalarla en iPhone: toca <b>Compartir</b> (cuadro con flecha) → <b>Agregar a pantalla de inicio</b>.
            </span>
          ) : (
            <span className="flex-1 text-sm">
              Para instalarla: en Chrome toca el menú <b>⋮</b> → <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

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

function PracticarReal() {
  const db = useDB();
  const recientes = (db.practicas ?? []).slice(0, 4);
  return (
    <section className="mb-10">
      <SectionTitle n="★">Practica con preguntas reales del ICFES</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          to="/generar"
          data-testid="ir-generar"
          className="group relative overflow-hidden rounded-xl border-2 border-foreground bg-foreground p-5 text-background shadow-[5px_5px_0_#E2401C] transition hover:-translate-y-0.5"
        >
          <Sparkles className="size-6 text-accent" />
          <p className="mt-3 font-display text-2xl font-extrabold leading-tight">Generar simulacro</p>
          <p className="mt-1 text-sm opacity-75">Elige tiempo y materias. Preguntas al azar de los cuadernillos oficiales, con explicación de cada respuesta.</p>
          <ArrowRight className="absolute right-5 top-5 size-5 transition group-hover:translate-x-1" />
        </Link>
        <Link
          to="/reforzar"
          data-testid="ir-reforzar"
          className="group relative overflow-hidden rounded-xl border-2 border-foreground bg-card p-5 transition hover:-translate-y-0.5"
        >
          <img src="/banco/ilus/mat-argumentar.webp" alt="" className="pointer-events-none absolute -bottom-6 -right-8 w-48 opacity-90" />
          <GraduationCap className="size-6 text-accent" />
          <p className="mt-3 font-display text-2xl font-extrabold leading-tight">Reforzar temas</p>
          <p className="relative mt-1 max-w-[16rem] text-sm text-muted-foreground">Lecciones sencillas e ilustradas de lo que más se te dificulta.</p>
        </Link>
      </div>
      {recientes.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {recientes.map((p) => {
            const total = p.items.reduce((a, it) => a + it.qs.length, 0);
            const resp = Object.keys(p.respuestas).length;
            return (
              <li key={p.id} className="group relative">
                <Link to={p.finalizado ? `/p/${p.id}/resultado` : `/p/${p.id}`} className="flex items-center gap-3 py-3 pr-10">
                  <span className={`size-2 shrink-0 rounded-full ${p.finalizado ? "bg-muted-foreground" : "animate-pulse bg-accent"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {p.finalizado ? "Terminado · ver resultados y explicaciones" : `En curso · ${resp}/${total} respondidas · continuar`}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" />
                </Link>
                <button
                  aria-label="Borrar"
                  onClick={() => confirm("¿Borrar este simulacro generado?") && store.eliminarPractica(p.id)}
                  className="absolute right-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Index() {
  const db = useDB();

  return (
    <Shell>
      <section className="grid grid-cols-1 gap-6 pb-8 pt-4 lg:grid-cols-[1.1fr_1fr] lg:items-end">
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

      <PracticarReal />

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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
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
        <Guardado />
        <Sincronizar />
        <p className="mb-3 mt-4 max-w-2xl text-sm text-muted-foreground">
          Copia de seguridad opcional: descarga un respaldo de vez en cuando.
        </p>
        <Respaldo />
      </section>
    </Shell>
  );
}
