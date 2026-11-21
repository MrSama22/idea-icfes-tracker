import { useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, FileUp, Loader2, Trash2, RotateCcw, Play, CheckCircle2, AlertTriangle, Sparkles, ImageIcon, FileText, X } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import { cartillas, progreso, subirArchivos, useCartillas, type Cartilla } from "../lib/cartillas";
import { MATERIAS, type MateriaId } from "../lib/domain";
import { store } from "../lib/store";
import { cn } from "../lib/utils";

export default function CartillasPage() {
  const lista = useCartillas();
  const [, nav] = useLocation();
  const [files, setFiles] = useState<File[]>([]);
  const [nombre, setNombre] = useState("");
  const [materia, setMateria] = useState<MateriaId | null>(null);
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const agregar = (fs: FileList | File[] | null) => {
    if (!fs) return;
    const ok = [...fs].filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") || f.type.startsWith("image/"));
    if (ok.length < [...fs].length) setError("Solo se aceptan PDF o fotos (JPG, PNG).");
    else setError(null);
    setFiles((xs) => [...xs, ...ok]);
  };

  const subir = async () => {
    if (!files.length || paso) return;
    setError(null);
    setPaso("Preparando…");
    try {
      await subirArchivos(files, nombre, materia, setPaso);
      setFiles([]);
      setNombre("");
      setMateria(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setPaso(null);
      if (input.current) input.current.value = "";
    }
  };

  const practicar = (c: Cartilla) => {
    const materias = [...new Set(c.unidades.map((u) => u.materia))];
    const orden = MATERIAS.map((m) => m.id).filter((m) => materias.includes(m));
    const items = orden.flatMap((m) => c.unidades.filter((u) => u.materia === m).map((u) => ({ u: u.id, qs: u.preguntas.map((p) => p.n) })));
    const p = store.crearPractica({ tipo: "simulacro", modo: "practica", nombre: `Cartilla: ${c.nombre}`, materias: orden, duracionMin: 0, items });
    nav(`/p/${p.id}`);
  };

  return (
    <Shell
      right={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Mis cartillas<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Sube un PDF o fotos de una cartilla o simulacro de tu colegio o preuniversitario. La leemos, sacamos las preguntas
        con sus textos y gráficas, y les ponemos explicación. Después salen en tus simulacros generados.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle n="01">Subir una cartilla</SectionTitle>
          <div
            role="button"
            tabIndex={0}
            data-testid="zona"
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastrando(true);
            }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastrando(false);
              agregar(e.dataTransfer.files);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 text-center transition",
              arrastrando ? "border-accent bg-accent/5" : "border-foreground/40 bg-card hover:border-foreground",
            )}
          >
            <FileUp className="size-8 text-accent" />
            <p className="font-display text-lg font-bold">Toca para elegir archivos</p>
            <p className="text-sm text-muted-foreground">o arrástralos aquí · PDF o fotos · hasta 120 páginas</p>
            <input
              ref={input}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="hidden"
              data-testid="archivo"
              onChange={(e) => agregar(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                  {f.type.startsWith("image/") ? <ImageIcon className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{(f.size / 1e6).toFixed(1)} MB</span>
                  <button aria-label="Quitar" onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="mt-5 block">
            <span className="text-sm font-semibold">Nombre (opcional)</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Simulacro Milton Ochoa #3"
              className="mt-1 h-11 w-full rounded-md border border-border bg-card px-3 outline-none focus:border-foreground"
            />
          </label>

          <div className="mt-4">
            <p className="text-sm font-semibold">¿De qué materia es?</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Chip on={materia === null} onClick={() => setMateria(null)}>
                <Sparkles className="size-3.5" /> Detectar sola
              </Chip>
              {MATERIAS.map((m) => (
                <Chip key={m.id} on={materia === m.id} onClick={() => setMateria(m.id)}>
                  <span className="size-2.5 rounded-full" style={{ background: m.color }} /> {m.corto}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Si la cartilla trae varias materias, deja "Detectar sola".</p>
          </div>

          <div className="mt-5 rounded-lg border-l-4 border-[#D99A06] bg-[#D99A06]/10 px-3 py-2.5 text-sm">
            <b>Consejo:</b> incluye la página de <b>respuestas correctas (la clave)</b> si la tiene. Si no la trae, la IA resuelve
            cada pregunta y te avisamos que la respuesta no es oficial.
          </div>

          <button
            data-testid="subir"
            disabled={!files.length || !!paso}
            onClick={subir}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-40 sm:w-auto sm:px-8"
          >
            {paso ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {paso}
              </>
            ) : (
              <>
                <FileUp className="size-4" /> Subir y procesar
              </>
            )}
          </button>
          {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        </section>

        <section>
          <SectionTitle n="02">Tus cartillas</SectionTitle>
          {!lista.length ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Todavía no has subido ninguna.
            </p>
          ) : (
            <>
              {lista.some((c) => c.fase !== "listo" && c.fase !== "error") && (
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  Esto tarda unos minutos (más o menos 1 minuto por cada 4 páginas). Puedes seguir usando la app; si cierras
                  la página, el proceso sigue cuando la vuelvas a abrir.
                </p>
              )}
              <ul className="space-y-3" data-testid="lista">
                {lista.map((c) => (
                  <Item key={c.id} c={c} onPracticar={() => practicar(c)} />
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-sm font-semibold transition",
        on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Barra({ hechas, total, label }: { hechas: number; total: number; label: string }) {
  const p = total ? Math.round((hechas / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>
          {hechas}/{total || "…"}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function Item({ c, onPracticar }: { c: Cartilla; onPracticar: () => void }) {
  const pr = progreso(c);
  const [borrar, setBorrar] = useState(false);
  const mats = [...new Set(c.unidades.map((u) => u.materia))].map((m) => MATERIAS.find((x) => x.id === m)!);
  const ia = c.unidades.some((u) => u.preguntas.some((q) => q.claveIA));
  return (
    <li className={cn("rounded-xl border-2 bg-card p-4", c.fase === "listo" ? "border-foreground" : "border-border")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-bold leading-tight">{c.nombre}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {new Date(c.creado).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
            {c.total > 0 && ` · ${c.total} páginas`}
          </p>
        </div>
        {c.fase === "listo" && <CheckCircle2 className="size-5 shrink-0 text-[#2E7D4F]" />}
        {c.fase === "error" && <AlertTriangle className="size-5 shrink-0 text-accent" />}
        {(c.fase === "leyendo" || c.fase === "extrayendo" || c.fase === "explicando") && <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {(c.fase === "leyendo" || c.fase === "extrayendo" || c.fase === "explicando") && (
        <div className="mt-3 space-y-2.5">
          <Barra label="1 · Leyendo páginas" hechas={pr.paginas.hechas} total={pr.paginas.total} />
          <Barra label="2 · Explicando preguntas" hechas={pr.unidades.hechas} total={pr.unidades.total} />
          {c.error && <p className="text-xs text-[#9a6b00]">{c.error}</p>}
        </div>
      )}

      {c.fase === "listo" && (
        <>
          <p className="mt-2 text-sm">
            <b data-testid="n-preguntas">{pr.preguntas} preguntas</b>
            {mats.length > 0 && <span className="text-muted-foreground"> · {mats.map((m) => m.corto).join(", ")}</span>}
          </p>
          {!!c.repetidas && <p className="mt-1 text-xs text-muted-foreground">{c.repetidas} ya estaban en tu banco y no se repitieron.</p>}
          {ia && <p className="mt-1 text-xs text-[#9a6b00]">Algunas respuestas las decidió la IA (la cartilla no traía clave).</p>}
          <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2">
            <span className="flex-1 text-sm font-medium">Usar en simulacros generados</span>
            <input type="checkbox" checked={c.activa} onChange={() => cartillas.alternar(c.id)} className="peer sr-only" />
            <span className={cn("relative h-6 w-11 rounded-full transition", c.activa ? "bg-[#2E7D4F]" : "bg-border")}>
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", c.activa ? "left-[22px]" : "left-0.5")} />
            </span>
          </label>
        </>
      )}

      {c.fase === "error" && <p className="mt-2 text-sm text-accent">{c.error ?? "Algo salió mal."}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {c.fase === "listo" && (
          <button onClick={onPracticar} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-semibold text-background">
            <Play className="size-3.5 fill-current" /> Practicar esta cartilla
          </button>
        )}
        {c.fase === "error" && c.total > 0 && (
          <button onClick={() => cartillas.reintentar(c.id)} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-foreground px-3 text-sm font-semibold">
            <RotateCcw className="size-3.5" /> Reintentar
          </button>
        )}
        {borrar ? (
          <span className="inline-flex items-center gap-2 text-sm">
            ¿Borrarla?
            <button onClick={() => cartillas.eliminar(c.id)} className="h-10 rounded-md bg-accent px-3 font-semibold text-accent-foreground">
              Sí, borrar
            </button>
            <button onClick={() => setBorrar(false)} className="h-10 px-2 text-muted-foreground">
              No
            </button>
          </span>
        ) : (
          <button onClick={() => setBorrar(true)} className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-accent">
            <Trash2 className="size-3.5" /> Eliminar
          </button>
        )}
      </div>
    </li>
  );
}
