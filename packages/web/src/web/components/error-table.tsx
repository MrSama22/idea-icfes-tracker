import { useState } from "react";
import { Trash2, StickyNote } from "lucide-react";
import {
  MATERIAS,
  TIPOS,
  materiaById,
  tipoById,
  type ErrorRegistrado,
  type MateriaId,
} from "../lib/domain";
import { store } from "../lib/store";

export function ErrorTable({
  errores,
  highlight,
}: {
  errores: ErrorRegistrado[];
  highlight: string | null;
}) {
  const [filtro, setFiltro] = useState<MateriaId | "ALL">("ALL");
  const lista = filtro === "ALL" ? errores : errores.filter((e) => e.materia === filtro);

  const ciclarTipo = (e: ErrorRegistrado) => {
    const i = TIPOS.findIndex((t) => t.id === e.tipo);
    store.actualizarError(e.id, { tipo: TIPOS[(i + 1) % TIPOS.length].id });
  };
  const editarNota = (e: ErrorRegistrado) => {
    const v = prompt(`Nota para ${materiaById(e.materia).corto} #${e.numeroPregunta}`, e.nota);
    if (v !== null) store.actualizarError(e.id, { nota: v.trim() });
  };

  return (
    <div>
      <div className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1 pb-1">
        {[{ id: "ALL" as const, corto: "Todas" }, ...MATERIAS].map((m) => (
          <button
            key={m.id}
            onClick={() => setFiltro(m.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${filtro === m.id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
          >
            {m.corto}
            {m.id !== "ALL" && (
              <span className="ml-1 font-mono opacity-70">
                {errores.filter((e) => e.materia === m.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {errores.length === 0
            ? "Los errores que registres aparecerán aquí al instante."
            : "Sin errores en esta materia."}
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">#</th>
                <th className="px-2 py-2">Materia</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="hidden px-2 py-2 sm:table-cell">Min</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => {
                const m = materiaById(e.materia);
                const t = tipoById(e.tipo);
                return (
                  <tr
                    key={e.id}
                    className={`border-b border-border/70 last:border-0 ${highlight === e.id ? "flash" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono text-base font-bold tnum">
                      {e.numeroPregunta}
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <i className="size-2 rounded-full" style={{ background: m.color }} />
                        {m.corto}
                      </span>
                      {e.nota && (
                        <div className="max-w-[12rem] truncate text-xs text-muted-foreground">
                          {e.nota}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => ciclarTipo(e)}
                        title="Toca para cambiar el tipo"
                        className="rounded-[3px] px-1.5 py-0.5 text-xs font-semibold text-white"
                        style={{ background: t.color }}
                      >
                        {t.corto}
                      </button>
                    </td>
                    <td className="hidden px-2 py-2 font-mono text-xs text-muted-foreground sm:table-cell">
                      {e.minuto ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">
                      <button
                        onClick={() => editarNota(e)}
                        className="rounded p-1.5 text-muted-foreground hover:text-foreground"
                        aria-label="Editar nota"
                      >
                        <StickyNote className="size-4" />
                      </button>
                      <button
                        onClick={() => store.eliminarError(e.id)}
                        className="rounded p-1.5 text-muted-foreground hover:text-accent"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
