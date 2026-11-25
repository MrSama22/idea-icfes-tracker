import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, FileUp, Globe, Loader2, LogIn, Trash2, RotateCcw, Play, CheckCircle2, AlertTriangle, Sparkles, ImageIcon, FileText, ShieldCheck, X, KeyRound } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import {
  cartillas,
  limpiarAviso,
  progreso,
  subirArchivos,
  useAviso,
  useCartillas,
  useGlobales,
  type Cartilla,
} from "../lib/cartillas";
import { auth, useAuth } from "../lib/auth";
import { MATERIAS, type MateriaId } from "../lib/domain";
import { store } from "../lib/store";
import { cn } from "../lib/utils";

export default function CartillasPage() {
  const lista = useCartillas();
  const globales = useGlobales();
  const aviso = useAviso();
  const { cuenta } = useAuth();
  const [ia, setIa] = useState<{ puede: boolean; propia: boolean; claves?: number; servidor: boolean } | null>(null);

  const recargarIA = () => {
    fetch("/api/ia/estado", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIa(d ?? null))
      .catch(() => setIa(null));
  };

  // La llave es por cuenta: hay que volver a consultar cuando entra o sale alguien.
  useEffect(() => {
    if (!cuenta) {
      setIa(null);
      return;
    }
    recargarIA();
  }, [cuenta?.id]);
  const iaLista = ia ? ia.puede : null;
  const [, nav] = useLocation();
  const [publicarGlobal, setPublicarGlobal] = useState(false);
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
      await subirArchivos(files, nombre, materia, setPaso, publicarGlobal && cuenta?.rol === "admin");
      setFiles([]);
      setNombre("");
      setMateria(null);
      setPublicarGlobal(false);
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

      {iaLista === false && (
        <div className="mt-5 rounded-lg border-l-4 border-[#D99A06] bg-[#D99A06]/10 px-3 py-2.5 text-sm">
          {cuenta && cuenta.rol !== "admin" ? (
            <>
              <b>Te falta tu clave de IA.</b> Cada cuenta usa sus propias claves para leer las cartillas (las del servidor no
              se comparten), así que todavía no puedes subir. Pégalas aquí abajo, en «Tu clave de IA»: valen las gratis de
              Gemini, Groq, OpenRouter o Mistral, y puedes poner varias a la vez para que la app vaya cambiando de una a otra
              cuando una llegue a su tope.
            </>
          ) : (
            <>
              <b>La IA no está configurada.</b> Falta <code className="font-mono text-[12px]">OPENAI_API_KEY</code>,{" "}
              <code className="font-mono text-[12px]">GEMINI_API_KEY</code> o{" "}
              <code className="font-mono text-[12px]">OPENROUTER_API_KEY</code> en este servidor, así que todavía no se
              pueden leer cartillas. También puedes poner tu clave aquí abajo, en «Tu clave de IA», sin tocar el servidor.
            </>
          )}
        </div>
      )}

      {aviso && (
        <div className="mt-4 flex items-start gap-2 rounded-md border-l-4 border-accent bg-accent/5 px-3 py-2 text-sm">
          <span className="flex-1">{aviso}</span>
          <button
            onClick={limpiarAviso}
            aria-label="Cerrar aviso"
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {!cuenta ? (
        <div className="mt-6 rounded-xl border-2 border-foreground bg-card p-6">
          <ShieldCheck className="size-7 text-[#2E7D4F]" />
          <h2 className="mt-3 font-display text-2xl font-extrabold">Entra para guardar tus cartillas</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Con una cuenta, cada cartilla que subas queda guardada en tu perfil y la encuentras en el celular o en otro
            computador. Sin cuenta no se puede subir.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/entrar"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground"
            >
              <LogIn className="size-4" /> Entrar o crear cuenta
            </Link>
            <Link to="/" className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold">
              Volver al inicio
            </Link>
          </div>
        </div>
      ) : (
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <section>
          <SectionTitle n="01">Subir una cartilla</SectionTitle>
          <ClaveIA ia={ia} recargar={recargarIA} />
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

          {cuenta.rol === "admin" && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border-2 border-foreground bg-card px-3 py-2.5">
              <input
                type="checkbox"
                checked={publicarGlobal}
                onChange={(e) => setPublicarGlobal(e.target.checked)}
                className="mt-1 size-4 shrink-0 accent-[#E2401C]"
              />
              <span className="text-sm">
                <b className="flex items-center gap-1.5">
                  <Globe className="size-3.5" /> Publicar para todas las cuentas
                </b>
                <span className="text-muted-foreground">
                  Queda como cartilla global: todos la pueden practicar y desde el panel de administrador decides qué
                  preguntas entran.
                </span>
              </span>
            </label>
          )}

          <div className="mt-5 rounded-lg border-l-4 border-[#D99A06] bg-[#D99A06]/10 px-3 py-2.5 text-sm">
            <b>Consejo:</b> incluye la página de <b>respuestas correctas (la clave)</b> si la tiene. Si no la trae, la IA resuelve
            cada pregunta y te avisamos que la respuesta no es oficial.
          </div>

          <button
            data-testid="subir"
            disabled={!files.length || !!paso || iaLista === false}
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
      )}

      {globales.length > 0 && (
        <section className="mt-10">
          <SectionTitle
            n="03"
            aside={<span className="font-mono text-xs text-muted-foreground">{globales.length}</span>}
          >
            Cartillas globales
          </SectionTitle>
          <p className="mb-3 text-sm text-muted-foreground">
            Las publicó el administrador. Se practican igual que las tuyas y no las puedes editar.
          </p>
          <ul className="space-y-3">
            {globales.map((c) => (
              <li key={c.id} className="rounded-xl border-2 border-border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <Globe className="mt-0.5 size-5 shrink-0 text-[#2F5DA8]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-bold leading-tight">{c.nombre}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {c.unidades.reduce((a, u) => a + u.preguntas.length, 0)} preguntas
                      {c.materia ? ` · ${MATERIAS.find((m) => m.id === c.materia)?.corto ?? ""}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => practicar(c)}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-semibold text-background"
                  >
                    <Play className="size-3.5 fill-current" /> Practicar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

/** Cada cuenta normal guarda su propia clave de IA (OpenAI, Google u OpenRouter); el admin puede usar la del servidor. */
function ClaveIA({
  ia,
  recargar,
}: {
  ia: { puede: boolean; propia: boolean; claves?: number; servidor: boolean } | null;
  recargar: () => void;
}) {
  const { cuenta } = useAuth();
  const [valor, setValor] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!cuenta) return null;

  // El administrador puede tirar de la clave del servidor, pero también debe poder poner la suya:
  // antes esta rama devolvía solo el aviso y no dejaba ningún formulario donde pegarla.
  const usaServidor = cuenta.rol === "admin" && Boolean(ia?.servidor) && !ia?.propia;

  const guardar = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      await auth.guardarClaveIA(valor.trim());
      setValor("");
      setAviso("Clave guardada. Ya puedes subir cartillas.");
      recargar();
    } catch (e) {
      setAviso(String((e as Error).message ?? e));
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      await auth.borrarClaveIA();
      setAviso("Clave borrada de tu cuenta.");
      recargar();
    } catch (e) {
      setAviso(String((e as Error).message ?? e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border-2 border-border bg-card p-4">
      <p className="flex items-center gap-2 font-display text-base font-bold">
        <KeyRound className="size-4 text-accent" /> Tu clave de IA
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada cuenta usa sus propias claves para leer las cartillas; las del servidor no se comparten. Se guardan en tu
        cuenta (no en este navegador) y no se vuelven a mostrar. <b>Pega varias, una por línea</b>: cuando una llega a su
        tope gratuito, la app pasa sola a la siguiente. Ningún servicio de IA es gratis sin ningún tope; lo que hace la
        app es repartir el trabajo entre todos los que tengas.
      </p>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>
          · <b>Gemini</b> (gratis, lee figuras):{" "}
          <span className="font-mono text-[12px]">aistudio.google.com/apikey</span> → empieza por{" "}
          <span className="font-mono text-[12px]">AQ.</span> o <span className="font-mono text-[12px]">AIza</span>
        </li>
        <li>
          · <b>Groq</b> (gratis, 1.000 al día):{" "}
          <span className="font-mono text-[12px]">console.groq.com/keys</span> → empieza por{" "}
          <span className="font-mono text-[12px]">gsk_</span> (solo texto: sirve para explicar, no para páginas con figuras)
        </li>
        <li>
          · <b>OpenRouter</b> (gratis, 50 al día):{" "}
          <span className="font-mono text-[12px]">openrouter.ai/keys</span> → empieza por{" "}
          <span className="font-mono text-[12px]">sk-or-</span>
        </li>
        <li>
          · <b>Mistral</b> (gratis, lee figuras):{" "}
          <span className="font-mono text-[12px]">console.mistral.ai/api-keys</span> → pégala como{" "}
          <span className="font-mono text-[12px]">mistral:tu-clave</span>
        </li>
        <li>
          · <b>NVIDIA</b> (gratis para probar, lee figuras):{" "}
          <span className="font-mono text-[12px]">build.nvidia.com</span> → empieza por{" "}
          <span className="font-mono text-[12px]">nvapi-</span>
        </li>
        <li>
          · <b>OpenAI</b> (de pago): <span className="font-mono text-[12px]">platform.openai.com/api-keys</span> → empieza
          por <span className="font-mono text-[12px]">sk-</span>
        </li>
      </ul>
      {usaServidor && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border-l-4 border-[#2E7D4F] bg-[#2E7D4F]/10 px-3 py-2.5 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-[#2E7D4F]" />
          <span>
            Ahora mismo se está usando la <b>clave de IA del servidor</b> (solo la puede usar tu cuenta de administrador).
            Si pones una tuya aquí abajo, la tuya manda.
          </span>
        </div>
      )}
      {ia?.propia ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2E7D4F]/10 px-2.5 py-1.5 text-sm font-semibold text-[#2E7D4F]">
            <CheckCircle2 className="size-4" />{" "}
            {ia?.claves ? `${ia.claves} ${ia.claves === 1 ? "clave guardada" : "claves guardadas"}` : "Clave guardada"}
          </span>
          <button
            onClick={borrar}
            disabled={ocupado}
            className="h-9 rounded-md border border-border px-3 text-sm font-semibold hover:border-foreground disabled:opacity-40"
          >
            Borrar y poner otras
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            rows={3}
            placeholder={"Una clave por línea (o separadas por comas):\nAQ…\nsk-or-…\ngsk_…\nmistral:…"}
            autoComplete="off"
            spellCheck={false}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-foreground"
          />
          <button
            onClick={guardar}
            disabled={ocupado || valor.trim().length < 20}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40"
          >
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : null} Guardar claves
          </button>
        </div>
      )}
      {aviso && <p className="mt-2 text-sm text-accent">{aviso}</p>}
    </div>
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
          <p className="truncate font-display text-lg font-bold leading-tight">
            {c.nombre}
            {c.global && (
              <span className="ml-2 rounded-[3px] bg-[#2F5DA8]/10 px-1.5 py-0.5 align-middle font-mono text-[10px] font-bold uppercase text-[#2F5DA8]">
                Global
              </span>
            )}
          </p>
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
