import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { img, type Figura } from "../lib/banco";
import { cn } from "../lib/utils";

const MARK = /\{\{FIG:(\d+)\}\}/g;

/** Dentro de una fórmula, "\$" (pesos) cerraría la fórmula antes de tiempo: se cambia por un carácter equivalente. */
export function arreglarPesos(t: string) {
  if (!t.includes("\\$")) return t;
  let out = "";
  let delim = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "\\") {
      if (t[i + 1] === "$") {
        out += delim ? "{\\char36}" : "\\$";
      } else out += c + (t[i + 1] ?? "");
      i++;
      continue;
    }
    if (c === "$") {
      let d = t[i + 1] === "$" ? "$$" : "$";
      if (delim === "$") d = "$"; // dentro de $…$ solo cierra un $
      delim = delim ? "" : d;
      out += d;
      i += d.length - 1;
      continue;
    }
    out += c;
  }
  return out;
}

export const Md = memo(function Md({ children, className }: { children: string; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {arreglarPesos(children)}
      </ReactMarkdown>
    </div>
  );
});

export function Fig({ f, className }: { f: Figura; className?: string }) {
  // Ancho natural a 220 dpi → a escala de lectura (~96 dpi) para que no se vea gigante
  const w = f.w ? Math.round(f.w * 0.62) : undefined;
  return (
    <figure className={cn("my-3", className)}>
      <img
        src={img(f.f)}
        alt={f.alt}
        loading="lazy"
        width={f.w}
        height={f.h}
        style={{ width: w ? `min(100%, ${w}px)` : undefined, height: "auto" }}
        className="mx-auto block rounded-sm bg-white mix-blend-multiply"
      />
    </figure>
  );
}

/** Texto con figuras incrustadas en el lugar de {{FIG:k}}; las no referenciadas van al final. */
export function Rico({ text, figuras = [], className }: { text: string; figuras?: Figura[]; className?: string }) {
  const partes: (string | number)[] = [];
  const usadas = new Set<number>();
  let last = 0;
  for (const m of (text ?? "").matchAll(MARK)) {
    partes.push(text.slice(last, m.index));
    const k = Number(m[1]);
    partes.push(k);
    usadas.add(k);
    last = (m.index ?? 0) + m[0].length;
  }
  partes.push((text ?? "").slice(last));
  return (
    <div className={className}>
      {partes.map((p, i) =>
        typeof p === "number" ? (
          figuras[p] ? <Fig key={i} f={figuras[p]} /> : null
        ) : p.trim() ? (
          <Md key={i}>{p}</Md>
        ) : null,
      )}
      {figuras.map((f, k) => (usadas.has(k) ? null : <Fig key={`x${k}`} f={f} />))}
    </div>
  );
}
