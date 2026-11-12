import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowRight, ChevronDown, ChevronLeft, ClipboardList, RotateCcw, Sparkles } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import { Contexto, Explicacion, PreguntaView } from "../components/pregunta";
import { Cargando } from "./generar";
import { useDB } from "../hooks/use-store";
import { ilus, itemsDesdeClaves, useBanco } from "../lib/banco";
import { MATERIAS, fmtClock, materiaById, pct } from "../lib/domain";
import { calificar } from "../lib/practica";
import { store } from "../lib/store";
import { cn } from "../lib/utils";

type Filtro = "fallos" | "todas" | "marcadas";

export default function ResultadoPage() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { banco, error } = useBanco();
  const db = useDB();
  const p = (db.practicas ?? []).find((x) => x.id === id) ?? null;
  const cal = useMemo(() => (banco && p ? calificar(banco, p) : null), [banco, p]);
  const [filtro, setFiltro] = useState<Filtro>("fallos");
  const [abierta, setAbierta] = useState<string | null>(null);

  if (!banco || !cal) return <Shell>{!banco ? <Cargando error={error} /> : <p className="py-20 text-center">No encontramos este simulacro.</p>}</Shell>;
  if (!p) return null;

  const nota = pct(cal.bien, cal.total);
  const fallos = cal.flat.filter((x) => p.respuestas[x.key] !== x.q.clave);
  const lista = filtro === "fallos" ? fallos : filtro === "marcadas" ? cal.flat.filter((x) => p.marcadas.includes(x.key)) : cal.flat;
  const temasDebiles = Object.entries(cal.porTema)
    .filter(([, v]) => v.bien < v.total)
    .sort((a, b) => a[1].bien / a[1].total - b[1].bien / b[1].total || b[1].total - a[1].total)
    .slice(0, 6);

  const repasar = () => {
    const np = store.crearPractica({
      tipo: "tema",
      modo: "practica",
      nombre: `Repaso de fallos · ${p.nombre}`,
      materias: p.materias,
      duracionMin: 0,
      items: itemsDesdeClaves(fallos.map((x) => x.key)),
    });
    nav(`/p/${np.id}`);
  };

  const mensaje =
    nota >= 80 ? "¡Muy bien! Vas por excelente camino." : nota >= 60 ? "Buen trabajo. Con unos ajustes subes mucho." : nota >= 40 ? "Vas avanzando. Revisa tus fallos con calma: ahí está tu mejora." : "Tranquilo: cada fallo es una pista de qué estudiar. Empecemos por ahí.";

  return (
    <Shell
      right={
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{p.nombre}</p>
      <div className="mt-2 grid grid-cols-1 gap-5 md:grid-cols-[auto_1fr] md:items-end">
        <div className="flex items-baseline gap-3">
          <span data-testid="nota" className="font-display text-7xl font-extrabold leading-none sm:text-8xl">
            {cal.bien}
            <span className="text-muted-foreground">/{cal.total}</span>
          </span>
        </div>
        <div>
          <p className="font-display text-2xl font-bold">
            {nota}% <span className="text-accent">de aciertos</span>
          </p>
          <p className="text-muted-foreground">{mensaje}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {cal.mal} incorrectas · {cal.blancas} sin responder · tiempo {fmtClock(p.acumuladoMs)}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle n="01">Por materia</SectionTitle>
          <ul className="space-y-3">
            {MATERIAS.filter((m) => cal.porMateria[m.id]).map((m) => {
              const v = cal.porMateria[m.id];
              const x = pct(v.bien, v.total);
              return (
                <li key={m.id}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="font-semibold">{m.nombre}</span>
                    <span className="font-mono">
                      {v.bien}/{v.total} · {x}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${x}%`, background: m.color }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {p.registroId && (
            <Link
              to={`/s/${p.registroId}`}
              className="mt-5 flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm hover:border-foreground"
            >
              <ClipboardList className="size-5 shrink-0 text-accent" />
              <span className="flex-1">Tus {fallos.length} fallos quedaron guardados en tu registro de errores, con su análisis.</span>
              <ArrowRight className="size-4" />
            </Link>
          )}
        </section>

        <section>
          <SectionTitle n="02">Temas para reforzar</SectionTitle>
          {temasDebiles.length ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {temasDebiles.map(([tid, v]) => {
                const t = banco.temaPorId.get(tid);
                if (!t) return null;
                return (
                  <Link
                    key={tid}
                    to={`/reforzar/${tid}`}
                    className="group flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card pr-3 hover:border-foreground"
                  >
                    <img src={ilus(tid)} alt="" className="h-16 w-20 shrink-0 object-cover" loading="lazy" />
                    <span className="min-w-0 flex-1 py-2">
                      <span className="block text-sm font-semibold leading-tight">{t.nombre}</span>
                      <span className="font-mono text-[11px] text-accent">
                        {v.total - v.bien} de {v.total} mal
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 transition group-hover:translate-x-0.5" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-border bg-card p-4 text-sm">¡Perfecto! No fallaste ningún tema.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {fallos.length > 0 && (
              <button onClick={repasar} className="inline-flex h-11 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-semibold text-background">
                <RotateCcw className="size-4" /> Volver a intentar mis fallos
              </button>
            )}
            <Link to="/generar" className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:border-foreground">
              <Sparkles className="size-4" /> Otro simulacro
            </Link>
          </div>
        </section>
      </div>

      <section className="mt-8">
        <SectionTitle n="03">Revisa cada pregunta</SectionTitle>
        <div className="mb-3 flex gap-1.5">
          {(
            [
              ["fallos", `Fallos (${fallos.length})`],
              ["todas", `Todas (${cal.total})`],
              ["marcadas", `Marcadas (${p.marcadas.length})`],
            ] as [Filtro, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium",
                filtro === k ? "border-foreground bg-foreground text-background" : "border-border",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {!lista.length && <p className="py-6 text-center text-sm text-muted-foreground">Nada por aquí.</p>}
        <ul className="space-y-2" data-testid="revision">
          {lista.map((x) => {
            const r = p.respuestas[x.key];
            const ok = r === x.q.clave;
            const open = abierta === x.key;
            const m = materiaById(x.u.materia);
            return (
              <li key={x.key} className={cn("rounded-lg border bg-card", open ? "border-foreground" : "border-border")}>
                <button
                  onClick={() => setAbierta(open ? null : x.key)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left"
                  aria-expanded={open}
                >
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full font-mono text-sm font-bold text-white",
                      ok ? "bg-[#2E7D4F]" : r ? "bg-accent" : "bg-muted-foreground",
                    )}
                  >
                    {x.i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{x.q.subtema || banco.temaPorId.get(x.q.tema)?.nombre}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      <span style={{ color: m.color }}>{m.corto}</span> · {ok ? `bien (${r})` : r ? `marcaste ${r} · era ${x.q.clave}` : `sin responder · era ${x.q.clave}`}
                    </span>
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 transition", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t border-border px-3 pb-4 pt-3 sm:px-4">
                    {(x.u.contexto || x.u.contextoFiguras.length > 0) && <Contexto u={x.u} abiertoInicial={false} className="mb-4" />}
                    <PreguntaView u={x.u} q={x.q} elegida={r} revelar />
                    <Explicacion q={x.q} elegida={r} temaNombre={banco.temaPorId.get(x.q.tema)?.nombre} />
                    <Link to={`/reforzar/${x.q.tema}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent">
                      Reforzar este tema <ArrowRight className="size-4" />
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </Shell>
  );
}
