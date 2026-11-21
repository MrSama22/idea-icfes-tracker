// Subrayado de textos durante el simulacro (como resaltar con marcador en el cuadernillo de papel).
// Usa la CSS Custom Highlight API: no se modifica el DOM, solo se pintan rangos.
// Cada marca se guarda como [inicio, fin, color] en caracteres de texto dentro de una "zona"
// (el texto de un grupo o el enunciado de una pregunta).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eraser, Highlighter } from "lucide-react";
import { cn } from "../lib/utils";

export type Marca = [number, number, number];
export type Marcas = Record<string, Marca[]>;
export type Herramienta = number | "borrar" | null;

export const COLORES = [
  { nombre: "Amarillo", css: "#FFE066" },
  { nombre: "Verde", css: "#9BE3A6" },
  { nombre: "Rosa", css: "#FFB3C7" },
];

const soportado = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

// ---------- texto ↔ rangos ----------
function offsetDe(root: Element, node: Node, off: number) {
  const r = document.createRange();
  r.selectNodeContents(root);
  try {
    r.setEnd(node, off);
  } catch {
    return -1;
  }
  return r.toString().length;
}

function rangoDe(root: Element, s: number, e: number): Range | null {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let n: Node | null;
  const r = document.createRange();
  let ini = false;
  while ((n = w.nextNode())) {
    const len = (n as Text).data.length;
    if (!ini && s <= pos + len) {
      r.setStart(n, Math.max(0, s - pos));
      ini = true;
    }
    if (ini && e <= pos + len) {
      r.setEnd(n, Math.max(0, e - pos));
      return r;
    }
    pos += len;
  }
  return null;
}

/** Quita [s,e) de una lista de marcas (partiendo las que queden a los lados). */
function recortar(ms: Marca[], s: number, e: number): Marca[] {
  const out: Marca[] = [];
  for (const [a, b, c] of ms) {
    if (b <= s || a >= e) out.push([a, b, c]);
    else {
      if (a < s) out.push([a, s, c]);
      if (b > e) out.push([e, b, c]);
    }
  }
  return out;
}

// ---------- contexto ----------
interface Ctx {
  herramienta: Herramienta;
  setHerramienta: (h: Herramienta) => void;
  marcas: Marcas;
  registrar: (zona: string, el: HTMLElement | null) => void;
  repintar: () => void;
  aplicar: (zona: string, s: number, e: number, color: number | "borrar") => void;
  quitarEn: (zona: string, off: number) => boolean;
}
const C = createContext<Ctx | null>(null);
export const useSubrayado = () => useContext(C);

export function SubrayadoProvider({ marcas, onChange, children }: { marcas: Marcas; onChange: (m: Marcas) => void; children: React.ReactNode }) {
  const [herramienta, setHerramienta] = useState<Herramienta>(null);
  const zonas = useRef(new Map<string, HTMLElement>());
  const marcasRef = useRef(marcas);
  marcasRef.current = marcas;

  const repintar = useCallback(() => {
    if (!soportado()) return;
    const hs = COLORES.map(() => new Highlight());
    for (const [zona, el] of zonas.current) {
      for (const [s, e, c] of marcasRef.current[zona] ?? []) {
        const r = rangoDe(el, s, e);
        if (r && hs[c]) hs[c].add(r);
      }
    }
    hs.forEach((h, i) => CSS.highlights.set(`sub-${i}`, h));
  }, []);

  useEffect(() => {
    repintar();
  }, [marcas, repintar]);
  useEffect(
    () => () => {
      if (soportado()) COLORES.forEach((_, i) => CSS.highlights.delete(`sub-${i}`));
    },
    [],
  );

  const registrar = useCallback((zona: string, el: HTMLElement | null) => {
    if (el) zonas.current.set(zona, el);
    else zonas.current.delete(zona);
  }, []);

  const aplicar = useCallback(
    (zona: string, s: number, e: number, color: number | "borrar") => {
      if (e <= s) return;
      const prev = marcasRef.current[zona] ?? [];
      let ms = recortar(prev, s, e);
      if (color !== "borrar") ms = [...ms, [s, e, color] as Marca].sort((a, b) => a[0] - b[0]);
      const next = { ...marcasRef.current, [zona]: ms };
      if (!ms.length) delete next[zona];
      onChange(next);
    },
    [onChange],
  );

  const quitarEn = useCallback(
    (zona: string, off: number) => {
      const prev = marcasRef.current[zona] ?? [];
      const ms = prev.filter(([a, b]) => !(off >= a && off <= b));
      if (ms.length === prev.length) return false;
      const next = { ...marcasRef.current, [zona]: ms };
      if (!ms.length) delete next[zona];
      onChange(next);
      return true;
    },
    [onChange],
  );

  const v = useMemo(
    () => ({ herramienta, setHerramienta, marcas, registrar, repintar, aplicar, quitarEn }),
    [herramienta, marcas, registrar, repintar, aplicar, quitarEn],
  );
  return (
    <C.Provider value={v}>
      {children}
      {soportado() && <MenuSeleccion />}
    </C.Provider>
  );
}

/** Zona de texto que se puede subrayar. Sin proveedor, solo muestra el contenido. */
export function Subrayable({ zona, children, className }: { zona: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(C);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.registrar(zona, ref.current);
    ctx.repintar();
    return () => {
      ctx.registrar(zona, null);
    };
  });
  if (!ctx) return <div className={className}>{children}</div>;

  const borrarAqui = (e: React.MouseEvent) => {
    if (ctx.herramienta !== "borrar" || !ref.current) return;
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    let node: Node | null = null;
    let off = 0;
    if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (p) [node, off] = [p.offsetNode, p.offset];
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r) [node, off] = [r.startContainer, r.startOffset];
    }
    if (!node || !ref.current.contains(node)) return;
    ctx.quitarEn(zona, offsetDe(ref.current, node, off));
  };

  return (
    <div
      ref={ref}
      data-zona={zona}
      onClick={borrarAqui}
      className={cn(className, ctx.herramienta === "borrar" && "cursor-cell", typeof ctx.herramienta === "number" && "cursor-text")}
    >
      {children}
    </div>
  );
}

/** Lee la selección actual si cae dentro de una sola zona. */
function leerSeleccion() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  const zonaDe = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest<HTMLElement>("[data-zona]");
  const z1 = zonaDe(r.startContainer);
  const z2 = zonaDe(r.endContainer);
  if (!z1 || z1 !== z2) return null;
  const s = offsetDe(z1, r.startContainer, r.startOffset);
  const e = offsetDe(z1, r.endContainer, r.endOffset);
  if (s < 0 || e <= s) return null;
  if (!r.toString().trim()) return null;
  return { zona: z1.dataset.zona!, s, e, rect: r.getBoundingClientRect() };
}

/** Menú flotante junto a lo seleccionado (en celular es la forma principal de subrayar). */
function MenuSeleccion() {
  const ctx = useContext(C)!;
  const [sel, setSel] = useState<ReturnType<typeof leerSeleccion>>(null);
  const herr = useRef(ctx.herramienta);
  herr.current = ctx.herramienta;
  const raton = useRef(false);

  useEffect(() => {
    let t = 0;
    const onSel = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        if (raton.current) return; // con ratón se decide al soltar
        setSel(leerSeleccion());
      }, 180);
    };
    const onDown = (e: PointerEvent) => {
      raton.current = e.pointerType === "mouse";
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      raton.current = false;
      const s = leerSeleccion();
      const h = herr.current;
      if (s && typeof h === "number") {
        ctx.aplicar(s.zona, s.s, s.e, h);
        window.getSelection()?.removeAllRanges();
        setSel(null);
      } else if (s && h === "borrar") {
        ctx.aplicar(s.zona, s.s, s.e, "borrar");
        window.getSelection()?.removeAllRanges();
        setSel(null);
      } else setSel(s);
    };
    const onScroll = () => setSel((x) => (x ? leerSeleccion() : x));
    document.addEventListener("selectionchange", onSel);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("selectionchange", onSel);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [ctx.aplicar]); // eslint-disable-line

  if (!sel) return null;
  const hay = (ctx.marcas[sel.zona] ?? []).some(([a, b]) => a < sel.e && b > sel.s);
  const W = 230;
  const H = 52;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(vw - W - 8, sel.rect.left + sel.rect.width / 2 - W / 2));
  // debajo de lo seleccionado (el menú nativo del celular sale arriba); sin tapar la barra inferior
  let top = sel.rect.bottom + 12;
  if (top + H > vh - 140) top = sel.rect.top - H - 12;
  top = Math.max(64, Math.min(vh - 140 - H, top));

  const usar = (c: number | "borrar") => {
    ctx.aplicar(sel.zona, sel.s, sel.e, c);
    if (typeof c === "number") ctx.setHerramienta(c);
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };

  return (
    <div
      data-testid="menu-subrayar"
      onPointerDown={(e) => e.preventDefault()}
      className="fixed z-50 flex items-center gap-1 rounded-full border-2 border-foreground bg-card p-1.5 shadow-[3px_3px_0_var(--foreground)]"
      style={{ left, top, width: W, height: H }}
    >
      <Highlighter className="ml-1.5 size-4 shrink-0" />
      <span className="mr-auto pl-1 text-xs font-semibold">Subrayar</span>
      {COLORES.map((c, i) => (
        <button
          key={i}
          aria-label={`Subrayar en ${c.nombre.toLowerCase()}`}
          data-testid={`sub-color-${i}`}
          onClick={() => usar(i)}
          className="size-9 shrink-0 rounded-full border-2 border-foreground/70"
          style={{ background: c.css }}
        />
      ))}
      {hay && (
        <button aria-label="Quitar subrayado" onClick={() => usar("borrar")} className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-foreground/70 bg-background">
          <Eraser className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Barra con el marcador elegido. */
export function BarraSubrayado() {
  const ctx = useContext(C);
  if (!ctx || !soportado()) return null;
  const { herramienta: h, setHerramienta } = ctx;
  const total = Object.values(ctx.marcas).reduce((a, m) => a + m.length, 0);
  return (
    <div className="flex items-center gap-1.5" data-testid="barra-subrayar">
      <span className="hidden items-center gap-1 font-mono text-[11px] text-muted-foreground sm:inline-flex">
        <Highlighter className="size-3.5" /> Marcador
      </span>
      {COLORES.map((c, i) => (
        <button
          key={i}
          aria-label={`Marcador ${c.nombre.toLowerCase()}`}
          aria-pressed={h === i}
          onClick={() => setHerramienta(h === i ? null : i)}
          className={cn("size-7 rounded-full border-2 transition", h === i ? "scale-110 border-foreground ring-2 ring-foreground ring-offset-2 ring-offset-background" : "border-foreground/40")}
          style={{ background: c.css }}
        />
      ))}
      <button
        aria-label="Borrador"
        aria-pressed={h === "borrar"}
        disabled={!total && h !== "borrar"}
        onClick={() => setHerramienta(h === "borrar" ? null : "borrar")}
        className={cn(
          "grid size-7 place-items-center rounded-full border-2 transition disabled:opacity-30",
          h === "borrar" ? "border-foreground bg-foreground text-background" : "border-foreground/40 bg-card",
        )}
      >
        <Eraser className="size-3.5" />
      </button>
    </div>
  );
}

export function AyudaSubrayado() {
  const ctx = useContext(C);
  if (!ctx || !soportado() || ctx.herramienta === null) return null;
  return (
    <p className="mb-3 rounded-md bg-[#D99A06]/15 px-3 py-2 text-xs">
      {ctx.herramienta === "borrar"
        ? "Borrador: toca un subrayado para quitarlo."
        : "Selecciona un pedazo del texto o del enunciado para subrayarlo. En celular: mantén presionado y arrastra."}
    </p>
  );
}
