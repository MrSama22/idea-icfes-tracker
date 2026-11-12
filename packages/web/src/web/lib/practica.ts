import { aplanar, type Banco } from "./banco";
import { MATERIAS, type MateriaId, type Practica, type TipoId } from "./domain";
import { store } from "./store";

export const transcurrido = (p: Practica, now = Date.now()) => p.acumuladoMs + (p.iniciadoEn ? now - p.iniciadoEn : 0);

export function pausar(id: string) {
  const p = store.getState().practicas?.find((x) => x.id === id);
  if (!p || !p.iniciadoEn) return;
  store.actualizarPractica(id, { acumuladoMs: transcurrido(p), iniciadoEn: null });
}
export function reanudar(id: string) {
  const p = store.getState().practicas?.find((x) => x.id === id);
  if (!p || p.iniciadoEn || p.finalizado) return;
  store.actualizarPractica(id, { iniciadoEn: Date.now() });
}

export function calificar(b: Banco, p: Practica) {
  const flat = aplanar(b, p);
  let bien = 0;
  let blancas = 0;
  const porMateria: Record<string, { bien: number; total: number }> = {};
  const porTema: Record<string, { bien: number; total: number }> = {};
  for (const it of flat) {
    const r = p.respuestas[it.key];
    const ok = r === it.q.clave;
    if (ok) bien++;
    if (!r) blancas++;
    (porMateria[it.u.materia] ??= { bien: 0, total: 0 }).total++;
    (porTema[it.q.tema] ??= { bien: 0, total: 0 }).total++;
    if (ok) {
      porMateria[it.u.materia].bien++;
      porTema[it.q.tema].bien++;
    }
  }
  return { flat, bien, total: flat.length, blancas, mal: flat.length - bien - blancas, porMateria, porTema };
}

/** Termina la práctica y pasa los fallos al registro de errores (para los análisis de siempre). */
export function terminar(b: Banco, id: string) {
  const p = store.getState().practicas?.find((x) => x.id === id);
  if (!p || p.finalizado) return;
  const ms = transcurrido(p);
  store.actualizarPractica(id, { finalizado: true, finalizadoEn: Date.now(), acumuladoMs: ms, iniciadoEn: null });
  if (p.tipo !== "simulacro" || p.registroId) return;
  const cal = calificar(b, { ...p, acumuladoMs: ms });
  const preguntas = Object.fromEntries(MATERIAS.map((m) => [m.id, cal.porMateria[m.id]?.total ?? 0])) as Record<MateriaId, number>;
  const errores = cal.flat
    .filter((it) => p.respuestas[it.key] !== it.q.clave)
    .map((it) => {
      const r = p.respuestas[it.key];
      // Sin responder → tiempo; fallar una fácil suele ser caer en el distractor; lo demás, vacío conceptual.
      const tipo: TipoId = !r ? "TIEMPO" : it.q.dificultad <= 1 ? "TRAMPA" : "VACIO";
      const tema = b.temaPorId.get(it.q.tema)?.nombre ?? "";
      return {
        materia: it.u.materia,
        numeroPregunta: it.q.n,
        tipo,
        nota: [tema, it.q.subtema].filter(Boolean).join(" · ") + (r ? ` (marcaste ${r}, era ${it.q.clave})` : " (sin responder)"),
      };
    });
  store.registrarFallos(id, {
    nombre: `Generado: ${p.nombre}`,
    duracionMin: p.duracionMin,
    acumuladoMs: ms,
    preguntas,
    errores,
  });
}
