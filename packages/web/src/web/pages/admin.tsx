import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronLeft, Loader2, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { Shell, SectionTitle, GhostButton } from "../components/shell";
import { auth, useAuth } from "../lib/auth";
import { MATERIAS, type MateriaId } from "../lib/domain";
import { cn } from "../lib/utils";

interface Cuenta {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "usuario";
  creado: number;
}

interface Resumen {
  id: string;
  nombre: string;
  materia: MateriaId | null;
  preguntas: number;
  creado: number;
}

interface Pregunta {
  n: number;
  enunciado: string;
  clave: string;
  tema?: string;
  [k: string]: unknown;
}

interface Unidad {
  id: string;
  materia: MateriaId;
  preguntas: Pregunta[];
  [k: string]: unknown;
}

interface GlobalCartilla {
  id: string;
  nombre: string;
  materia: MateriaId | null;
  creado: number;
  unidades: Unidad[];
}

export default function AdminPage() {
  const { cuenta, listo } = useAuth();
  const [usuarios, setUsuarios] = useState<Cuenta[]>([]);
  const [globales, setGlobales] = useState<Resumen[]>([]);
  const [abierta, setAbierta] = useState<GlobalCartilla | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const esAdmin = cuenta?.rol === "admin";

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [us, gl] = await Promise.all([
        auth.usuarios(),
        fetch("/api/global", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setUsuarios(us);
      setGlobales(gl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos.");
    }
  }, []);

  useEffect(() => {
    if (esAdmin) void cargar();
  }, [esAdmin, cargar]);

  const abrir = async (id: string) => {
    setError(null);
    setAviso(null);
    const r = await fetch(`/api/global/${id}`, { cache: "no-store" });
    if (!r.ok) {
      setError("No se pudo abrir esa cartilla.");
      return;
    }
    setAbierta(await r.json());
  };

  const guardar = async (c: GlobalCartilla) => {
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch(`/api/global/${c.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c),
      });
      if (!r.ok) throw new Error("No se pudieron guardar los cambios.");
      const { cargarGlobales } = await import("../lib/cartillas");
      await cargarGlobales();
      await cargar();
      setAviso("Cambios guardados. Todas las cuentas verán la cartilla actualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setOcupado(false);
    }
  };

  const borrar = async (id: string) => {
    if (!confirm("¿Borrar esta cartilla para todas las cuentas?")) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/global/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("No se pudo borrar.");
      setAbierta(null);
      const { cargarGlobales } = await import("../lib/cartillas");
      await cargarGlobales();
      await cargar();
      setAviso("Cartilla borrada para todas las cuentas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    } finally {
      setOcupado(false);
    }
  };

  const claveTemporal = async (email: string) => {
    if (!confirm(`¿Generar una contraseña temporal para ${email}? La anterior deja de funcionar.`)) return;
    setError(null);
    try {
      const r = await auth.claveTemporal(email);
      setAviso(`Contraseña temporal de ${r.email}: ${r.clave} — cópiala y mándasela.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    }
  };

  if (!listo) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </p>
      </Shell>
    );
  }

  if (!esAdmin) {
    return (
      <Shell
        right={
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Inicio
          </Link>
        }
      >
        <div className="mx-auto mt-6 max-w-md rounded-xl border-2 border-border bg-card p-6 text-center">
          <ShieldAlert className="mx-auto size-7 text-accent" />
          <h1 className="mt-3 font-display text-2xl font-extrabold">Solo para el administrador</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cuenta ? "Tu cuenta no tiene permisos de administrador." : "Entra con la cuenta de administrador para continuar."}
          </p>
          <Link
            to="/entrar"
            className="mt-4 inline-flex h-11 items-center rounded-md bg-accent px-4 font-semibold text-accent-foreground"
          >
            Entrar
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      right={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Administrador<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Publica cartillas para todas las cuentas y decide qué preguntas entran. Todo lo que cambies aquí lo ven todos
        los estudiantes al volver a abrir la app.
      </p>

      {aviso && (
        <p className="mt-4 rounded-md border-l-4 border-[#2E7D4F] bg-[#2E7D4F]/10 px-3 py-2 text-sm break-words">{aviso}</p>
      )}
      {error && <p className="mt-4 text-sm font-medium text-accent">{error}</p>}

      <section className="mt-8">
        <SectionTitle n="01" aside={<span className="font-mono text-xs text-muted-foreground">{globales.length}</span>}>
          Cartillas globales
        </SectionTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Súbelas desde <Link to="/cartillas" className="underline underline-offset-2 hover:text-accent">Mis cartillas</Link>{" "}
          marcando «Publicar para todas las cuentas».
        </p>

        {!globales.length ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Todavía no has publicado ninguna cartilla.
          </p>
        ) : (
          <ul className="space-y-3">
            {globales.map((g) => (
              <li key={g.id} className="rounded-xl border-2 border-foreground bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-bold leading-tight">{g.nombre}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {g.preguntas} preguntas · {new Date(g.creado).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <GhostButton onClick={() => (abierta?.id === g.id ? setAbierta(null) : void abrir(g.id))}>
                    <ChevronDown className={cn("size-4 transition", abierta?.id === g.id && "rotate-180")} />
                    {abierta?.id === g.id ? "Cerrar" : "Editar preguntas"}
                  </GhostButton>
                  <button
                    aria-label="Borrar cartilla"
                    onClick={() => void borrar(g.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-accent"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {abierta?.id === g.id && (
                  <Editor
                    c={abierta}
                    ocupado={ocupado}
                    onCambio={setAbierta}
                    onGuardar={() => void guardar(abierta)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <SectionTitle n="02" aside={<span className="font-mono text-xs text-muted-foreground">{usuarios.length}</span>}>
          Cuentas
        </SectionTitle>
        <ul className="divide-y divide-border border-y border-border">
          {usuarios.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{u.email}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {u.nombre} · {new Date(u.creado).toLocaleDateString("es-CO")}
                </p>
              </div>
              {u.rol === "admin" && (
                <span className="rounded-[3px] bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
                  Admin
                </span>
              )}
              <GhostButton onClick={() => void claveTemporal(u.email)}>Contraseña temporal</GhostButton>
            </li>
          ))}
          {!usuarios.length && (
            <li className="py-8 text-center text-sm text-muted-foreground">Todavía no hay cuentas registradas.</li>
          )}
        </ul>
      </section>
    </Shell>
  );
}

function Editor({
  c,
  ocupado,
  onCambio,
  onGuardar,
}: {
  c: GlobalCartilla;
  ocupado: boolean;
  onCambio: (c: GlobalCartilla) => void;
  onGuardar: () => void;
}) {
  const [materia, setMateria] = useState<MateriaId>(c.materia ?? MATERIAS[0].id);
  const [enunciado, setEnunciado] = useState("");
  const [opciones, setOpciones] = useState(["", "", "", ""]);
  const [clave, setClave] = useState("A");
  const [explicacion, setExplicacion] = useState("");

  const quitar = (uid: string, n: number) => {
    onCambio({
      ...c,
      unidades: c.unidades.map((u) => (u.id === uid ? { ...u, preguntas: u.preguntas.filter((p) => p.n !== n) } : u)),
    });
  };

  const agregar = () => {
    const texto = opciones.map((o) => o.trim());
    if (!enunciado.trim() || texto.some((o) => !o)) return;
    const letras = ["A", "B", "C", "D"];
    const n = Math.max(0, ...c.unidades.flatMap((u) => u.preguntas.map((p) => p.n))) + 1;
    const nueva: Pregunta = {
      n,
      enunciado: enunciado.trim(),
      figuras: [],
      opciones: letras.map((l, i) => ({ l, t: texto[i], figuras: [] })),
      clave,
      afirmacion: null,
      nivel: null,
      tema: "",
      subtema: "",
      resumen: "",
      explicacion: explicacion.trim(),
      porque: {},
      trampa: "",
      mejorar: "",
      estrategia: "",
      dificultad: 2,
      seg: 90,
    };
    const existente = c.unidades.find((u) => u.materia === materia);
    const unidades = existente
      ? c.unidades.map((u) => (u.id === existente.id ? { ...u, preguntas: [...u.preguntas, nueva] } : u))
      : [
          ...c.unidades,
          {
            id: `u${Date.now().toString(36)}`,
            materia,
            examen: null,
            contexto: "",
            contextoFiguras: [],
            segCtx: 0,
            preguntas: [nueva],
            fuente: { id: c.id, nombre: c.nombre },
          } as Unidad,
        ];
    onCambio({ ...c, unidades });
    setEnunciado("");
    setOpciones(["", "", "", ""]);
    setExplicacion("");
    setClave("A");
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="space-y-4">
        {c.unidades.map((u) => (
          <div key={u.id}>
            <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              {MATERIAS.find((m) => m.id === u.materia)?.nombre ?? u.materia} · {u.preguntas.length} preguntas
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {u.preguntas.map((p) => (
                <li key={`${u.id}-${p.n}`} className="flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <span className="mt-0.5 font-mono text-[11px] font-bold text-accent">{p.n}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="line-clamp-2">{p.enunciado}</span>
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground">clave {p.clave}</span>
                  </span>
                  <button
                    aria-label={`Borrar pregunta ${p.n}`}
                    onClick={() => quitar(u.id, p.n)}
                    className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-accent"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
              {!u.preguntas.length && <li className="text-xs text-muted-foreground">Sin preguntas.</li>}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg border-2 border-dashed border-border bg-background p-3">
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          <Plus className="size-3.5" /> Añadir una pregunta
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px]">
          <input
            value={enunciado}
            onChange={(e) => setEnunciado(e.target.value)}
            placeholder="Enunciado de la pregunta"
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
          />
          <select
            value={materia}
            onChange={(e) => setMateria(e.target.value as MateriaId)}
            aria-label="Materia"
            className="h-10 rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-foreground"
          >
            {MATERIAS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.corto}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {opciones.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold">{["A", "B", "C", "D"][i]}</span>
              <input
                value={o}
                onChange={(e) => setOpciones((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Opción ${["A", "B", "C", "D"][i]}`}
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
              />
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr]">
          <select
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            aria-label="Respuesta correcta"
            className="h-10 rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-foreground"
          >
            {["A", "B", "C", "D"].map((l) => (
              <option key={l} value={l}>
                Clave {l}
              </option>
            ))}
          </select>
          <input
            value={explicacion}
            onChange={(e) => setExplicacion(e.target.value)}
            placeholder="Explicación (opcional)"
            className="h-10 min-w-0 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
          />
        </div>
        <button
          onClick={agregar}
          disabled={!enunciado.trim() || opciones.some((o) => !o.trim())}
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md bg-foreground px-3 text-sm font-semibold text-background disabled:opacity-40"
        >
          <Plus className="size-3.5" /> Añadir
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={onGuardar}
          disabled={ocupado}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-4 font-semibold text-accent-foreground disabled:opacity-50"
        >
          {ocupado ? <Loader2 className="size-4 animate-spin" /> : null} Guardar cambios para todas las cuentas
        </button>
        <span className="text-xs text-muted-foreground">Los borrados y las preguntas nuevas se aplican al guardar.</span>
      </div>
    </div>
  );
}
