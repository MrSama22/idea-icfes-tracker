import { MATERIAS, TIPOS, pct, type ErrorRegistrado, type Simulacro } from "../lib/domain";
import { estadisticas, type Estadisticas, type Hallazgo } from "../lib/analytics";
import { AlertTriangle, CheckCircle2, Flame, Info } from "lucide-react";

/** Barras por materia apiladas por tipo de error. */
export function MateriaBars({ st }: { st: Estadisticas }) {
  const max = Math.max(1, ...MATERIAS.map((m) => st.porMateria[m.id]));
  return (
    <div className="space-y-2.5">
      {MATERIAS.map((m) => {
        const n = st.porMateria[m.id];
        return (
          <div key={m.id} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate font-medium">{m.corto}</span>
            <div className="flex h-6 overflow-hidden rounded-[3px] bg-muted">
              <div
                className="flex h-full transition-all duration-500"
                style={{ width: `${(n / max) * 100}%` }}
              >
                {TIPOS.map((t) => {
                  const c = st.matriz[m.id][t.id];
                  if (!c) return null;
                  return (
                    <div
                      key={t.id}
                      title={`${t.nombre}: ${c}`}
                      className="h-full border-r border-card/60 last:border-r-0"
                      style={{ width: `${(c / n) * 100}%`, background: t.color }}
                    />
                  );
                })}
              </div>
            </div>
            <span className="text-right font-mono text-sm font-semibold tnum">{n}</span>
          </div>
        );
      })}
      <Legend />
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
      {TIPOS.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-[2px]" style={{ background: t.color }} />
          {t.nombre}
        </span>
      ))}
    </div>
  );
}

/** Proporción global por tipo de error. */
export function TipoSplit({ st }: { st: Estadisticas }) {
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {TIPOS.map((t) => (
          <div
            key={t.id}
            className="h-full transition-all duration-500"
            style={{ width: `${pct(st.porTipo[t.id], st.total)}%`, background: t.color }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {TIPOS.map((t) => (
          <div key={t.id} className="border-l-[3px] pl-2" style={{ borderColor: t.color }}>
            <div className="font-display text-2xl font-bold leading-none tnum">
              {pct(st.porTipo[t.id], st.total)}%
            </div>
            <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
              {t.corto} · {st.porTipo[t.id]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mapa de calor materia × tipo. */
export function Heatmap({ st }: { st: Estadisticas }) {
  const max = Math.max(1, ...MATERIAS.flatMap((m) => TIPOS.map((t) => st.matriz[m.id][t.id])));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th />
            {TIPOS.map((t) => (
              <th key={t.id} className="pb-1 text-left font-medium text-muted-foreground">
                {t.corto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATERIAS.map((m) => (
            <tr key={m.id}>
              <td className="pr-2 font-medium">{m.corto}</td>
              {TIPOS.map((t) => {
                const v = st.matriz[m.id][t.id];
                const a = v / max;
                return (
                  <td
                    key={t.id}
                    className="h-9 rounded-[3px] text-center font-mono text-sm font-semibold tnum"
                    style={{
                      background: v
                        ? `color-mix(in srgb, ${t.color} ${Math.round(15 + a * 85)}%, transparent)`
                        : "var(--muted)",
                      color: a > 0.55 ? "#FBF9F3" : "var(--foreground)",
                    }}
                  >
                    {v || "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Errores por cuarto del tiempo del simulacro. */
export function TiempoCuartos({ st }: { st: Estadisticas }) {
  const max = Math.max(1, ...st.porCuarto);
  const total = st.porCuarto.reduce((a, b) => a + b, 0);
  if (!total)
    return (
      <p className="text-sm text-muted-foreground">
        Inicia el temporizador para ver en qué momento del simulacro fallas más.
      </p>
    );
  return (
    <div className="flex h-28 items-end gap-2">
      {st.porCuarto.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-mono text-xs font-semibold tnum">{v}</span>
          <div
            className="w-full rounded-t-[3px] bg-foreground transition-all"
            style={{ height: `${(v / max) * 72 + 4}px`, opacity: 0.35 + (v / max) * 0.65 }}
          />
          <span className="font-mono text-[10px] text-muted-foreground">Q{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

const nivelStyle: Record<Hallazgo["nivel"], { icon: typeof Flame; color: string }> = {
  critico: { icon: Flame, color: "#E2401C" },
  alerta: { icon: AlertTriangle, color: "#D99A06" },
  info: { icon: Info, color: "#2F5DA8" },
  bien: { icon: CheckCircle2, color: "#2E7D4F" },
};

export function Diagnostico({ items }: { items: Hallazgo[] }) {
  return (
    <ol className="space-y-3">
      {items.map((h, i) => {
        const { icon: Icon, color } = nivelStyle[h.nivel];
        return (
          <li key={i} className="rise flex gap-3" style={{ animationDelay: `${i * 60}ms` }}>
            <Icon className="mt-0.5 size-5 shrink-0" style={{ color }} strokeWidth={2.2} />
            <div>
              <p className="font-semibold leading-snug">{h.titulo}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{h.detalle}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Evolución entre simulacros: total de errores (barras apiladas por tipo) + línea de % acierto. */
export function Evolucion({
  simulacros,
  errores,
}: {
  simulacros: Simulacro[];
  errores: ErrorRegistrado[];
}) {
  const lista = [...simulacros].sort((a, b) => a.creadoEn - b.creadoEn).slice(-12);
  if (lista.length < 2)
    return (
      <p className="text-sm text-muted-foreground">
        Necesitas al menos 2 simulacros para ver tu evolución. Cada simulacro nuevo suma un punto a
        la curva.
      </p>
    );
  const data = lista.map((s) => ({
    s,
    st: estadisticas(
      s,
      errores.filter((e) => e.simulacroId === s.id),
    ),
  }));
  const max = Math.max(1, ...data.map((d) => d.st.total));
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 28, t: 14, b: 34 };
  const cw = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(42, cw * 0.55);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ya = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  const pts = data
    .map((d, i) =>
      d.st.aciertoEstimado == null
        ? null
        : `${pad.l + cw * i + cw / 2},${ya(d.st.aciertoEstimado)}`,
    )
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Evolución de errores por simulacro"
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={W - pad.r}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--border)"
            strokeDasharray="3 4"
          />
        ))}
        <text x={4} y={y(max) + 4} className="fill-muted-foreground font-mono" fontSize="10">
          {max}
        </text>
        <text x={4} y={y(0) + 4} className="fill-muted-foreground font-mono" fontSize="10">
          0
        </text>
        {data.map((d, i) => {
          const x = pad.l + cw * i + (cw - bw) / 2;
          let acc = 0;
          return (
            <g key={d.s.id}>
              {TIPOS.map((t) => {
                const v = d.st.porTipo[t.id];
                if (!v) return null;
                const y1 = y(acc + v);
                const h = y(acc) - y1;
                acc += v;
                return (
                  <rect
                    key={t.id}
                    x={x}
                    y={y1}
                    width={bw}
                    height={Math.max(0, h - 1)}
                    fill={t.color}
                    rx={1.5}
                  />
                );
              })}
              <text
                x={x + bw / 2}
                y={y(d.st.total) - 5}
                textAnchor="middle"
                fontSize="11"
                className="fill-foreground font-mono"
                fontWeight={700}
              >
                {d.st.total}
              </text>
              <text
                x={x + bw / 2}
                y={H - 12}
                textAnchor="middle"
                fontSize="10"
                className="fill-muted-foreground"
              >
                {d.s.nombre.length > 10 ? d.s.nombre.slice(0, 9) + "…" : d.s.nombre}
              </text>
            </g>
          );
        })}
        {pts && (
          <polyline
            points={pts}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeDasharray="1 0"
          />
        )}
        {data.map((d, i) =>
          d.st.aciertoEstimado == null ? null : (
            <g key={d.s.id + "p"}>
              <circle
                cx={pad.l + cw * i + cw / 2}
                cy={ya(d.st.aciertoEstimado)}
                r={4}
                fill="var(--card)"
                stroke="var(--foreground)"
                strokeWidth={2}
              />
            </g>
          ),
        )}
        <text
          x={W - 4}
          y={ya(100) + 4}
          textAnchor="end"
          fontSize="10"
          className="fill-muted-foreground font-mono"
        >
          100%
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend />
        <span className="inline-flex items-center gap-1.5 pt-1">
          <i className="inline-block h-0.5 w-4 bg-foreground" /> % acierto estimado
        </span>
      </div>
    </div>
  );
}

/** Tabla de tendencia por materia (último vs anterior). */
export function TendenciaMaterias({
  simulacros,
  errores,
}: {
  simulacros: Simulacro[];
  errores: ErrorRegistrado[];
}) {
  const lista = [...simulacros].sort((a, b) => a.creadoEn - b.creadoEn);
  if (lista.length < 2) return null;
  const last = lista[lista.length - 1];
  const prev = lista[lista.length - 2];
  const sl = estadisticas(
    last,
    errores.filter((e) => e.simulacroId === last.id),
  );
  const sp = estadisticas(
    prev,
    errores.filter((e) => e.simulacroId === prev.id),
  );
  return (
    <div className="grid grid-cols-5 gap-px overflow-hidden rounded-md border border-border bg-border">
      {MATERIAS.map((m) => {
        const d = sl.porMateria[m.id] - sp.porMateria[m.id];
        return (
          <div key={m.id} className="bg-card p-2.5">
            <div className="truncate text-[11px] text-muted-foreground">{m.corto}</div>
            <div className="font-display text-xl font-bold tnum">{sl.porMateria[m.id]}</div>
            <div
              className={`font-mono text-[11px] font-semibold ${d < 0 ? "text-[#2E7D4F]" : d > 0 ? "text-accent" : "text-muted-foreground"}`}
            >
              {d === 0 ? "= igual" : d < 0 ? `▼ ${Math.abs(d)}` : `▲ ${d}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
