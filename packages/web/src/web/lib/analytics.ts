// Motor de analítica y diagnóstico (equivalente a GET /api/estadisticas/{simulacro_id}).
import {
  MATERIAS,
  TIPOS,
  materiaById,
  pct,
  tipoById,
  totalPreguntas,
  type ErrorRegistrado,
  type MateriaId,
  type Simulacro,
  type TipoId,
} from "./domain";

export interface Estadisticas {
  total: number;
  porMateria: Record<MateriaId, number>;
  porTipo: Record<TipoId, number>;
  matriz: Record<MateriaId, Record<TipoId, number>>;
  aciertoEstimado: number | null; // % estimado de acierto global
  aciertoPorMateria: Record<MateriaId, number | null>;
  porCuarto: number[]; // errores por cuarto de tiempo del simulacro
}

const zeroTipos = () => Object.fromEntries(TIPOS.map((t) => [t.id, 0])) as Record<TipoId, number>;
const zeroMaterias = () =>
  Object.fromEntries(MATERIAS.map((m) => [m.id, 0])) as Record<MateriaId, number>;

export function estadisticas(s: Simulacro | null, errores: ErrorRegistrado[]): Estadisticas {
  const porMateria = zeroMaterias();
  const porTipo = zeroTipos();
  const matriz = Object.fromEntries(MATERIAS.map((m) => [m.id, zeroTipos()])) as Record<
    MateriaId,
    Record<TipoId, number>
  >;
  const porCuarto = [0, 0, 0, 0];

  // Una pregunta cuenta una vez por materia para el % de acierto
  const unicas = new Set<string>();
  for (const e of errores) {
    porMateria[e.materia]++;
    porTipo[e.tipo]++;
    matriz[e.materia][e.tipo]++;
    unicas.add(`${e.materia}-${e.numeroPregunta}`);
    if (s && e.minuto != null && s.duracionMin > 0) {
      const q = Math.min(3, Math.floor((e.minuto / s.duracionMin) * 4));
      porCuarto[q]++;
    }
  }

  const aciertoPorMateria = Object.fromEntries(
    MATERIAS.map((m) => {
      const total = s?.preguntas[m.id] ?? 0;
      if (!total) return [m.id, null];
      const fallos = [...unicas].filter((k) => k.startsWith(m.id + "-")).length;
      return [m.id, Math.max(0, 100 - pct(fallos, total))];
    }),
  ) as Record<MateriaId, number | null>;

  const tot = s ? totalPreguntas(s) : 0;
  return {
    total: errores.length,
    porMateria,
    porTipo,
    matriz,
    aciertoEstimado: tot ? Math.max(0, 100 - pct(unicas.size, tot)) : null,
    aciertoPorMateria,
    porCuarto,
  };
}

export interface Hallazgo {
  nivel: "critico" | "alerta" | "info" | "bien";
  titulo: string;
  detalle: string;
}

export function diagnostico(
  s: Simulacro | null,
  errores: ErrorRegistrado[],
  anterior?: { simulacro: Simulacro; errores: ErrorRegistrado[] },
): Hallazgo[] {
  const st = estadisticas(s, errores);
  const out: Hallazgo[] = [];
  if (st.total === 0) {
    return [
      {
        nivel: "info",
        titulo: "Sin errores registrados todavía",
        detalle: "Registra cada fallo durante o después del simulacro para generar tu diagnóstico.",
      },
    ];
  }

  // 1. Materia que más sangra
  const materiasOrden = MATERIAS.map((m) => ({ m, n: st.porMateria[m.id] })).sort(
    (a, b) => b.n - a.n,
  );
  const top = materiasOrden[0];
  if (top.n > 0) {
    out.push({
      nivel: pct(top.n, st.total) >= 35 ? "critico" : "alerta",
      titulo: `${top.m.nombre} concentra el ${pct(top.n, st.total)}% de tus errores`,
      detalle: `${top.n} de ${st.total} errores. Es donde más puntaje estás perdiendo; prioriza este bloque en tu próxima semana de estudio.`,
    });
  }

  // 2. Tipo dominante por materia
  for (const { m, n } of materiasOrden) {
    if (n < 3) continue;
    const fila = st.matriz[m.id];
    const [tipoId, cnt] = (Object.entries(fila) as [TipoId, number][]).sort(
      (a, b) => b[1] - a[1],
    )[0];
    const p = pct(cnt, n);
    if (p < 50) continue;
    const t = tipoById(tipoId);
    out.push({
      nivel: p >= 65 ? "critico" : "alerta",
      titulo: `El ${p}% de tus fallas en ${m.nombre} son por ${t.nombre.toLowerCase()}`,
      detalle: t.consejo,
    });
  }

  // 3. Tipo global dominante
  const [tg, cg] = (Object.entries(st.porTipo) as [TipoId, number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const tgi = tipoById(tg);
  out.push({
    nivel: "info",
    titulo: `Tu patrón global: ${tgi.nombre} (${pct(cg, st.total)}%)`,
    detalle:
      tg === "VACIO"
        ? "Tus errores vienen de no saber el tema. Estudiar contenido rinde más que hacer más simulacros."
        : tg === "TRAMPA"
          ? "Sabes el tema pero caes en opciones diseñadas para confundir. Trabaja lectura del enunciado y descarte."
          : "El reloj te está ganando. Entrena ritmo: marca y salta las preguntas largas, vuelve al final.",
  });

  // 4. Fatiga / gestión del tiempo
  const conMinuto = st.porCuarto.reduce((a, b) => a + b, 0);
  if (conMinuto >= 6) {
    const ultimo = st.porCuarto[3];
    const primero = st.porCuarto[0];
    if (pct(ultimo, conMinuto) >= 40) {
      out.push({
        nivel: "alerta",
        titulo: `El ${pct(ultimo, conMinuto)}% de tus errores ocurre en el último cuarto del tiempo`,
        detalle:
          "Señal de fatiga o prisa al final. Practica simulacros completos y deja las materias fuertes para el cierre.",
      });
    } else if (pct(primero, conMinuto) >= 40) {
      out.push({
        nivel: "info",
        titulo: "Arrancas fallando más de lo normal",
        detalle: `El ${pct(primero, conMinuto)}% de los errores aparece en el primer cuarto. Calienta con 3-4 preguntas fáciles antes de empezar.`,
      });
    }
  }

  // 5. Comparativa con el simulacro anterior
  if (anterior) {
    const prev = estadisticas(anterior.simulacro, anterior.errores);
    const diff = st.total - prev.total;
    if (prev.total > 0) {
      out.push({
        nivel: diff < 0 ? "bien" : diff > 0 ? "alerta" : "info",
        titulo:
          diff < 0
            ? `Mejoraste: ${Math.abs(diff)} errores menos que en “${anterior.simulacro.nombre}”`
            : diff > 0
              ? `${diff} errores más que en “${anterior.simulacro.nombre}”`
              : `Mismo número de errores que en “${anterior.simulacro.nombre}”`,
        detalle:
          MATERIAS.map((m) => {
            const d = st.porMateria[m.id] - prev.porMateria[m.id];
            return d === 0 ? null : `${m.corto} ${d > 0 ? "+" : ""}${d}`;
          })
            .filter(Boolean)
            .join(" · ") || "Sin cambios por materia.",
      });
    }
  }

  // 6. Materias limpias
  const limpias = MATERIAS.filter((m) => st.porMateria[m.id] === 0);
  if (limpias.length && limpias.length < MATERIAS.length) {
    out.push({
      nivel: "bien",
      titulo: `Sin errores en ${limpias.map((m) => m.corto).join(", ")}`,
      detalle: "Mantén estas materias con repasos cortos y dedica el tiempo pesado a las débiles.",
    });
  }

  return out;
}

export function materiaNombre(id: MateriaId) {
  return materiaById(id).nombre;
}
