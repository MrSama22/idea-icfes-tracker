import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Pause, Play, Plus, RotateCcw, Flag, StickyNote, Undo2 } from "lucide-react";
import { Kbd } from "./shell";
import {
  MATERIAS,
  TIPOS,
  elapsedMs,
  fmtClock,
  materiaById,
  tipoById,
  type ErrorRegistrado,
  type MateriaId,
  type Simulacro,
  type TipoId,
} from "../lib/domain";
import { store } from "../lib/store";
import { useNow } from "../hooks/use-store";

export function Timer({ s }: { s: Simulacro }) {
  const now = useNow(!!s.iniciadoEn);
  const el = elapsedMs(s, now);
  const total = s.duracionMin * 60000;
  const restante = total - el;
  const over = restante < 0;
  const progreso = Math.min(1, el / total);
  const corriendo = !!s.iniciadoEn;

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`font-mono text-3xl font-bold tracking-tight tnum sm:text-4xl ${over ? "text-accent" : ""}`}
          >
            {fmtClock(over ? -restante : restante)}
          </span>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            {over ? "tiempo extra" : "restante"} · {fmtClock(el)} usado
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${over ? "bg-accent" : "bg-foreground"}`}
            style={{ width: `${progreso * 100}%` }}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => store.toggleTimer(s.id)}
          className={`inline-flex h-11 items-center gap-1.5 rounded-md px-4 text-sm font-semibold transition active:scale-95 ${corriendo ? "bg-foreground text-background" : "bg-accent text-accent-foreground"}`}
          title="Espacio"
        >
          {corriendo ? <Pause className="size-4" /> : <Play className="size-4" />}
          <span className="hidden sm:inline">
            {corriendo ? "Pausar" : el > 0 ? "Reanudar" : "Iniciar"}
          </span>
          <Kbd className="hidden lg:inline-flex">␣</Kbd>
        </button>
        <button
          onClick={() => confirm("¿Finalizar el simulacro?") && store.finalizar(s.id)}
          className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-card transition hover:border-foreground"
          title="Finalizar"
        >
          <Flag className="size-4" />
        </button>
        <button
          onClick={() => confirm("¿Reiniciar el temporizador a cero?") && store.resetTimer(s.id)}
          className="hidden size-11 items-center justify-center rounded-md border border-border bg-card transition hover:border-foreground sm:inline-flex"
          title="Reiniciar"
        >
          <RotateCcw className="size-4" />
        </button>
      </div>
    </div>
  );
}

interface Toast {
  id: number;
  text: string;
  undo?: ErrorRegistrado;
  warn?: boolean;
}

export function CapturePanel({
  s,
  errores,
  onRegistrado,
}: {
  s: Simulacro;
  errores: ErrorRegistrado[];
  onRegistrado: (id: string) => void;
}) {
  const [materia, setMateria] = useState<MateriaId>(
    () => (localStorage.getItem("idea:materia") as MateriaId) || "MAT",
  );
  const [numero, setNumero] = useState("");
  const [nota, setNota] = useState("");
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pulse, setPulse] = useState<TipoId | null>(null);
  const numRef = useRef<HTMLInputElement>(null);
  const notaRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => localStorage.setItem("idea:materia", materia), [materia]);

  const showToast = (t: Omit<Toast, "id">) => {
    clearTimeout(toastTimer.current);
    setToast({ ...t, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const registrar = useCallback(
    (tipo: TipoId) => {
      const n = parseInt(numero, 10);
      if (!n || n < 1) {
        showToast({ text: "Escribe el número de la pregunta primero", warn: true });
        numRef.current?.focus();
        return;
      }
      const dup = errores.find((e) => e.materia === materia && e.numeroPregunta === n);
      if (dup) {
        showToast({
          text: `Ya registraste ${materiaById(materia).corto} #${n} (${tipoById(dup.tipo).corto})`,
          warn: true,
        });
        return;
      }
      const e = store.registrarError({ simulacroId: s.id, materia, numeroPregunta: n, tipo, nota });
      setPulse(tipo);
      setTimeout(() => setPulse(null), 350);
      setNumero("");
      setNota("");
      setNotaAbierta(false);
      onRegistrado(e.id);
      showToast({ text: `${materiaById(materia).corto} #${n} · ${tipoById(tipo).corto}`, undo: e });
      if (navigator.vibrate) navigator.vibrate(18);
    },
    [numero, materia, nota, errores, s.id, onRegistrado],
  );

  const deshacer = useCallback(() => {
    const last = toast?.undo ?? errores[0];
    if (!last) return;
    store.eliminarError(last.id);
    showToast({ text: `Eliminado ${materiaById(last.materia).corto} #${last.numeroPregunta}` });
  }, [toast, errores]);

  // Atajos de teclado globales
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const target = ev.target as HTMLElement;
      if (target === notaRef.current) {
        if (ev.key === "Escape" || ev.key === "Enter") {
          ev.preventDefault();
          notaRef.current?.blur();
        }
        return;
      }
      if (target.tagName === "INPUT" && target !== numRef.current) return;
      if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      const k = ev.key.toLowerCase();

      const m = MATERIAS.find((x) => x.key === k);
      if (m) {
        ev.preventDefault();
        setMateria(m.id);
        return;
      }
      const t = TIPOS.find((x) => x.key === k);
      if (t) {
        ev.preventDefault();
        registrar(t.id);
        return;
      }
      if (k === "z") {
        ev.preventDefault();
        deshacer();
        return;
      }
      if (k === "n") {
        ev.preventDefault();
        setNotaAbierta(true);
        setTimeout(() => notaRef.current?.focus(), 0);
        return;
      }
      if (ev.key === " " && target.tagName !== "BUTTON") {
        ev.preventDefault();
        store.toggleTimer(s.id);
        return;
      }
      if (ev.key === "Escape") {
        setNumero("");
        numRef.current?.blur();
        return;
      }
      if (target === numRef.current) {
        if (
          /^\d$/.test(ev.key) ||
          ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"].includes(ev.key)
        )
          return;
        ev.preventDefault();
        return;
      }
      if (/^\d$/.test(ev.key)) {
        ev.preventDefault();
        setNumero((v) => (v + ev.key).slice(0, 3));
      } else if (ev.key === "Backspace") {
        ev.preventDefault();
        setNumero((v) => v.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registrar, deshacer, s.id]);

  const step = (d: number) => setNumero((v) => String(Math.max(1, (parseInt(v, 10) || 0) + d)));
  const listo = !!parseInt(numero, 10);

  return (
    <div className="relative">
      {/* Materia (sticky) */}
      <div className="grid grid-cols-5 gap-1 rounded-md bg-muted p-1">
        {MATERIAS.map((m) => {
          const on = m.id === materia;
          return (
            <button
              key={m.id}
              onClick={() => setMateria(m.id)}
              className={`relative flex h-12 flex-col items-center justify-center rounded-[5px] px-1 text-[11px] font-semibold leading-tight transition sm:text-xs ${on ? "bg-card shadow-[0_1px_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span
                className="mb-1 h-1 w-5 rounded-full"
                style={{ background: on ? m.color : "transparent" }}
              />
              <span className="truncate">{m.corto}</span>
              <Kbd className="absolute right-1 top-1 hidden min-w-0 border-0 px-0 lg:inline-flex">
                {m.key}
              </Kbd>
            </button>
          );
        })}
      </div>

      {/* Número de pregunta */}
      <div className="mt-3 flex items-stretch gap-2">
        <button
          onClick={() => step(-1)}
          className="flex w-12 items-center justify-center rounded-md border border-border bg-card active:scale-95"
          aria-label="Menos"
        >
          <Minus className="size-4" />
        </button>
        <label className="relative flex flex-1 items-center rounded-md border-2 border-foreground bg-card px-3">
          <span className="mr-2 font-mono text-xs uppercase text-muted-foreground">Preg.</span>
          <span className="font-mono text-3xl font-bold text-muted-foreground/50">#</span>
          <input
            ref={numRef}
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="—"
            aria-label="Número de pregunta"
            className="h-14 w-full min-w-0 bg-transparent font-mono text-3xl font-bold outline-none tnum placeholder:text-muted-foreground/40"
          />
          <button
            onClick={() => {
              setNotaAbierta((v) => !v);
              setTimeout(() => notaRef.current?.focus(), 0);
            }}
            className={`ml-2 rounded p-1.5 transition ${nota ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}
            title="Nota (N)"
            type="button"
          >
            <StickyNote className="size-5" />
          </button>
        </label>
        <button
          onClick={() => step(1)}
          className="flex w-12 items-center justify-center rounded-md border border-border bg-card active:scale-95"
          aria-label="Más"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {notaAbierta && (
        <input
          ref={notaRef}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota opcional (ej. confundí pH con pOH)"
          className="mt-2 h-11 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
        />
      )}

      {/* Tipo de error = registrar */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TIPOS.map((t) => (
          <button
            key={t.id}
            onClick={() => registrar(t.id)}
            className={`group relative flex h-20 flex-col items-start justify-between overflow-hidden rounded-md p-2.5 text-left text-white transition active:scale-[0.97] sm:h-24 sm:p-3 ${listo ? "" : "opacity-80 saturate-[0.7]"} ${pulse === t.id ? "scale-[0.96]" : ""}`}
            style={{ background: t.color }}
          >
            <Kbd className="hidden border-white/40 text-white lg:inline-flex">{t.key}</Kbd>
            <span className="text-[13px] font-bold leading-tight sm:text-sm">
              {t.id === "TIEMPO" ? (
                <>
                  Tiempo /<br className="sm:hidden" /> Adivinanza
                </>
              ) : t.id === "TRAMPA" ? (
                <>
                  Trampa del
                  <br className="sm:hidden" /> distractor
                </>
              ) : (
                <>
                  Vacío
                  <br className="sm:hidden" /> conceptual
                </>
              )}
            </span>
            <span className="pointer-events-none absolute -bottom-6 -right-3 font-display text-7xl font-extrabold opacity-15">
              {t.key.toUpperCase()}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2 hidden text-[11px] text-muted-foreground lg:block">
        Atajos: <Kbd>M</Kbd> <Kbd>L</Kbd> <Kbd>C</Kbd> <Kbd>S</Kbd> <Kbd>I</Kbd> materia · dígitos =
        pregunta · <Kbd>V</Kbd> <Kbd>D</Kbd> <Kbd>T</Kbd> registrar · <Kbd>N</Kbd> nota ·{" "}
        <Kbd>Z</Kbd> deshacer · <Kbd>␣</Kbd> timer · <Kbd>Esc</Kbd> limpiar
      </p>

      {toast &&
        createPortal(
          <div
            key={toast.id}
            className={`rise fixed inset-x-3 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-md px-4 py-3 text-sm shadow-lg ${toast.warn ? "bg-accent text-accent-foreground" : "bg-foreground text-background"}`}
          >
            <span className="font-medium">
              {toast.warn ? toast.text : <>✓ Registrado · {toast.text}</>}
            </span>
            {toast.undo && (
              <button
                onClick={deshacer}
                className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
              >
                <Undo2 className="size-4" /> Deshacer
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
