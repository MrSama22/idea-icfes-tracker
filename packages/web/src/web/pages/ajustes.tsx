import { Link } from "wouter";
import { ChevronLeft, MessageCircleQuestion } from "lucide-react";
import { Shell, SectionTitle } from "../components/shell";
import { ajustes, useAjustes } from "../lib/ajustes";
import { RAZONES_BLANCA } from "../lib/domain";
import { cn } from "../lib/utils";

export default function AjustesPage() {
  const a = useAjustes();

  return (
    <Shell
      right={
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Inicio
        </Link>
      }
    >
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Ajustes<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 max-w-2xl text-muted-foreground">
        Preferencias de este dispositivo. No cambian tus datos ni el de tus simulacros.
      </p>

      <section className="mt-6">
        <SectionTitle n="01">Retroalimentación</SectionTitle>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-foreground bg-card p-4">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-accent/10 text-accent">
            <MessageCircleQuestion className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-bold leading-tight">
              Preguntar por qué dejé preguntas en blanco
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              Al terminar un simulacro te mostramos las preguntas sin responder y eliges el motivo de cada una.
              Ese motivo se guarda como el tipo de error (tiempo, vacío o confusión) y cambia los consejos y el
              análisis que ves después.
            </span>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {RAZONES_BLANCA.map((r) => (
                <span
                  key={r.id}
                  className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                >
                  {r.label}
                </span>
              ))}
            </span>
          </span>
          <input
            type="checkbox"
            checked={a.preguntarBlancas}
            onChange={(e) => ajustes.set({ preguntarBlancas: e.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "relative mt-1 h-6 w-11 shrink-0 rounded-full transition",
              a.preguntarBlancas ? "bg-[#2E7D4F]" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                a.preguntarBlancas ? "left-[22px]" : "left-0.5",
              )}
            />
          </span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Activado por defecto. Si lo apagas, las preguntas en blanco se registran como falta de tiempo, que es lo
          más común. Puedes cambiarlo cuando quieras: solo afecta a los simulacros que termines desde ahora.
        </p>
      </section>
    </Shell>
  );
}
