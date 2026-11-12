import { materiaById, tipoById, type ErrorRegistrado, type Simulacro } from "./domain";

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function erroresCSV(simulacros: Simulacro[], errores: ErrorRegistrado[]) {
  const byId = new Map(simulacros.map((s) => [s.id, s]));
  const header = [
    "simulacro",
    "fecha_simulacro",
    "materia",
    "pregunta",
    "tipo_error",
    "minuto",
    "nota",
    "registrado",
  ];
  const rows = [...errores]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => {
      const s = byId.get(e.simulacroId);
      return [
        s?.nombre ?? e.simulacroId,
        s ? new Date(s.fecha).toLocaleDateString("es-CO") : "",
        materiaById(e.materia).nombre,
        e.numeroPregunta,
        tipoById(e.tipo).nombre,
        e.minuto ?? "",
        e.nota,
        new Date(e.timestamp).toLocaleString("es-CO"),
      ]
        .map(esc)
        .join(",");
    });
  // BOM para que Excel lea tildes correctamente
  return "﻿" + [header.join(","), ...rows].join("\n");
}

export const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "simulacro";
