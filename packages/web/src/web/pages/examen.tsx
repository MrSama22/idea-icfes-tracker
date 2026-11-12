import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Flag, Grid3x3, Pause, Play, X } from "lucide-react";
import { Contexto, Explicacion, PreguntaView } from "../components/pregunta";
import { Cargando } from "./generar";
import { useDB, useNow } from "../hooks/use-store";
import { aplanar, useBanco } from "../lib/banco";
import { MATERIAS, fmtClock } from "../lib/domain";
import { pausar, reanudar, terminar, transcurrido } from "../lib/practica";
import { store } from "../lib/store";
import { cn } from "../lib/utils";

export default function ExamenPage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { banco, error } = useBanco();
  const db = useDB();
  const p = (db.practicas ?? []).find((x) => x.id === id) ?? null;
  const flat = useMemo(() => (banco && p ? aplanar(banco, p) : []), [banco, p?.items]); // eslint-disable-line
  const [hoja, setHoja] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLDivElement>(null);

  // Cronómetro: corre mientras la página está abierta y visible.
  useEffect(() => {
    if (!p || p.finalizado) return;
    reanudar(id);
    const vis = () => (document.hidden ? pausar(id) : reanudar(id));
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      pausar(id);
    };
  }, [id, !!p, p?.finalizado]); // eslint-disable-line

  const now = useNow(!!p?.iniciadoEn, 500);
  const ms = p ? transcurrido(p, now) : 0;
  const limite = p && p.duracionMin > 0 ? p.duracionMin * 60000 : 0;
  const restante = limite ? limite - ms : 0;
  const tiempoAgotado = !!limite && restante <= 0 && p?.modo === "examen";

  useEffect(() => {
    if (tiempoAgotado && banco && p && !p.finalizado) terminar(banco, p.id);
  }, [tiempoAgotado, banco, p]);

  const i = Math.min(p?.actual ?? 0, Math.max(0, flat.length - 1));
  const it = flat[i];
  const ir = (k: number) => {
    if (!p) return;
    const j = Math.max(0, Math.min(flat.length - 1, k));
    if (j !== i) store.actualizarPractica(p.id, { actual: j });
    setHoja(false);
    const mismoTexto = flat[j]?.u.id === it?.u.id && !!(it?.u.contexto || it?.u.contextoFiguras.length);
    const movil = window.innerWidth < 1024;
    requestAnimationFrame(() =>
      (mismoTexto && movil ? qRef.current : topRef.current)?.scrollIntoView({ block: "start" }),
    );
  };

  const practica = p?.modo === "practica";
  const elegida = it ? p?.respuestas[it.key] : undefined;
  const revelado = practica && !!elegida;

  const elegir = (l: string | undefined) => {
    if (!p || !it || p.finalizado || revelado) return;
    store.actualizarPractica(p.id, (x) => {
      const r = { ...x.respuestas };
      if (l) r[it.key] = l;
      else delete r[it.key];
      return { respuestas: r };
    });
  };
  const marcar = () => {
    if (!p || !it) return;
    store.actualizarPractica(p.id, (x) => ({
      marcadas: x.marcadas.includes(it.key) ? x.marcadas.filter((k) => k !== it.key) : [...x.marcadas, it.key],
    }));
  };

  // Atajos de teclado en PC: A-D eligen, flechas navegan
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") ir(i + 1);
      else if (e.key === "ArrowLeft") ir(i - 1);
      else if (it && /^[a-h]$/i.test(e.key) && it.q.opciones.some((o) => o.l === e.key.toUpperCase()))
        elegir(elegida === e.key.toUpperCase() ? undefined : e.key.toUpperCase());
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (!banco) return <Cargando error={error} />;
  if (!p)
    return (
      <div className="py-20 text-center">
        <p className="font-display text-2xl font-bold">No encontramos este simulacro</p>
        <Link to="/generar" className="mt-3 inline-block text-sm text-accent underline">
          Generar uno nuevo
        </Link>
      </div>
    );
  if (p.finalizado) {
    return <Terminado id={p.id} agotado={tiempoAgotado} onVer={() => nav(`/p/${p.id}/resultado`)} />;
  }
  if (!it) return <Cargando />;

  const respondidas = flat.filter((x) => p.respuestas[x.key]).length;
  const blancas = flat.length - respondidas;
  const tieneCtx = !!(it.u.contexto || it.u.contextoFiguras.length);
  const enPocoTiempo = limite && restante < 5 * 60000;
  const ultima = i === flat.length - 1;

  return (
    <div className="min-h-dvh pb-44">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="font-display text-xl font-extrabold" title="Salir (se guarda tu avance)">
            IDEA<span className="text-accent">.</span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">{p.nombre}</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-foreground transition-all" style={{ width: `${(respondidas / flat.length) * 100}%` }} />
            </div>
          </div>
          <button
            onClick={() => (p.iniciadoEn ? pausar(p.id) : reanudar(p.id))}
            data-testid="reloj"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums",
              enPocoTiempo ? "border-accent bg-accent text-white" : "border-border bg-card",
            )}
            title={p.iniciadoEn ? "Pausar" : "Reanudar"}
          >
            {p.iniciadoEn ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {limite ? fmtClock(Math.max(0, restante)) : fmtClock(ms)}
          </button>
          <button
            data-testid="terminar"
            onClick={() => setConfirmar(true)}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background"
          >
            Terminar
          </button>
        </div>
      </header>

      {!p.iniciadoEn && (
        <button onClick={() => reanudar(p.id)} className="block w-full bg-[#D99A06] py-2 text-center text-sm font-semibold text-foreground">
          En pausa — toca para seguir
        </button>
      )}

      <div ref={topRef} className="scroll-mt-16" />
      <main className="mx-auto max-w-6xl px-4 pt-4">
        <div className="mb-3 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>
            Pregunta <b className="text-foreground">{i + 1}</b> de {flat.length}
          </span>
          <span>{respondidas} respondidas</span>
        </div>
        <div className={cn("grid grid-cols-1 gap-5", tieneCtx && "lg:grid-cols-2")}>
          {tieneCtx && (
            <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto scroll-fino">
              <Contexto key={it.u.id} u={it.u} />
              {it.grupo.length < it.u.preguntas.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  De este texto salen {it.grupo.length} de sus {it.u.preguntas.length} preguntas.
                </p>
              )}
            </div>
          )}
          <div ref={qRef} className={cn("scroll-mt-20", !tieneCtx && "mx-auto w-full max-w-2xl")}>
            <PreguntaView u={it.u} q={it.q} numero={i + 1} elegida={elegida} onElegir={elegir} revelar={revelado} />
            {revelado && (
              <>
                <Explicacion q={it.q} elegida={elegida} temaNombre={banco.temaPorId.get(it.q.tema)?.nombre} />
                <button
                  onClick={() => (ultima ? setConfirmar(true) : ir(i + 1))}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-foreground font-semibold text-background"
                >
                  {ultima ? "Ver resultados" : "Siguiente pregunta"} <ArrowRight className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* Barra inferior de navegación */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5">
          <button
            aria-label="Anterior"
            disabled={i === 0}
            onClick={() => ir(i - 1)}
            className="grid h-12 w-12 place-items-center rounded-md border border-border bg-card disabled:opacity-30"
          >
            <ArrowLeft className="size-5" />
          </button>
          <button
            onClick={marcar}
            aria-pressed={p.marcadas.includes(it.key)}
            className={cn(
              "inline-flex h-12 items-center gap-1.5 rounded-md border px-3 text-sm font-medium",
              p.marcadas.includes(it.key) ? "border-accent bg-accent/10 text-accent" : "border-border bg-card",
            )}
            title="Marcar para revisar después"
          >
            <Flag className={cn("size-4", p.marcadas.includes(it.key) && "fill-current")} />
            <span className="hidden sm:inline">Revisar luego</span>
          </button>
          <button
            data-testid="abrir-hoja"
            onClick={() => setHoja(true)}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium"
          >
            <Grid3x3 className="size-4" /> Hoja de respuestas
          </button>
          <button
            data-testid="siguiente"
            aria-label="Siguiente"
            onClick={() => (ultima ? setConfirmar(true) : ir(i + 1))}
            className="inline-flex h-12 items-center gap-1.5 rounded-md bg-foreground px-4 font-semibold text-background"
          >
            <span className="hidden sm:inline">{ultima ? "Terminar" : "Siguiente"}</span>
            <ArrowRight className="size-5" />
          </button>
        </div>
        {/* franja inferior: progreso a la izquierda, el sello de Runable queda a la derecha */}
        <div className="mx-auto flex h-[60px] max-w-6xl items-start px-4 pt-1 font-mono text-[11px] text-muted-foreground">
          {respondidas}/{flat.length} respondidas{p.marcadas.length ? ` · ${p.marcadas.length} para revisar` : ""}
        </div>
      </nav>

      {hoja && (
        <Modal onClose={() => setHoja(false)} titulo="Hoja de respuestas">
          <div className="space-y-4">
            {MATERIAS.filter((m) => flat.some((x) => x.u.materia === m.id)).map((m) => (
              <div key={m.id}>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: m.color }} /> {m.nombre}
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                  {flat
                    .filter((x) => x.u.materia === m.id)
                    .map((x) => {
                      const r = p.respuestas[x.key];
                      const ok = practica && r ? r === x.q.clave : null;
                      return (
                        <button
                          key={x.key}
                          onClick={() => ir(x.i)}
                          className={cn(
                            "relative flex h-11 flex-col items-center justify-center rounded-md border font-mono text-xs leading-tight",
                            x.i === i && "ring-2 ring-accent ring-offset-1 ring-offset-card",
                            ok === true && "border-[#2E7D4F] bg-[#2E7D4F] text-white",
                            ok === false && "border-accent bg-accent text-white",
                            ok === null && r && "border-foreground bg-foreground text-background",
                            !r && "border-border bg-background",
                          )}
                        >
                          <span className="font-semibold">{x.i + 1}</span>
                          <span className="text-[10px] opacity-80">{r ?? "·"}</span>
                          {p.marcadas.includes(x.key) && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-accent" />}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {respondidas} respondidas · {blancas} sin responder · {p.marcadas.length} para revisar
          </p>
        </Modal>
      )}

      {confirmar && (
        <Modal onClose={() => setConfirmar(false)} titulo="¿Terminar el simulacro?">
          <p>
            {blancas
              ? `Te quedan ${blancas} pregunta${blancas === 1 ? "" : "s"} sin responder. En el ICFES no se resta por equivocarse: es mejor marcar algo que dejarla en blanco.`
              : "Respondiste todas las preguntas."}
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => setConfirmar(false)} className="h-12 flex-1 rounded-md border border-border font-medium">
              Seguir respondiendo
            </button>
            <button
              data-testid="confirmar-terminar"
              onClick={() => {
                terminar(banco, p.id);
                nav(`/p/${p.id}/resultado`);
              }}
              className="h-12 flex-1 rounded-md bg-accent font-semibold text-white"
            >
              Ver resultados
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Terminado({ agotado, onVer }: { id: string; agotado: boolean; onVer: () => void }) {
  useEffect(() => {
    if (!agotado) onVer();
  }, [agotado, onVer]);
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-display text-4xl font-extrabold">Se acabó el tiempo</p>
        <p className="mt-2 text-muted-foreground">Igual que en el examen real. Veamos cómo te fue.</p>
        <button onClick={onVer} className="mt-6 h-12 rounded-md bg-accent px-6 font-semibold text-white">
          Ver resultados
        </button>
      </div>
    </div>
  );
}

export function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-2 border-foreground bg-card p-5 pb-24 sm:max-w-lg sm:rounded-2xl sm:pb-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{titulo}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-md hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

