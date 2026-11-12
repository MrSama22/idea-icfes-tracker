# IDEA — ICFES Diagnostic & Error Analytics Engine — Design

Web app responsiva (móvil primero, también PC) para registrar errores durante un simulacro ICFES en < 2 s,
y analizarlos después. Dirección visual: "hoja de respuestas" — papel cálido, tinta negra, un acento bermellón
de lápiz rojo de corrección. Denso, utilitario, tipografía con carácter. Nada de tarjetas genéricas.

## Colores (CSS vars en `packages/web/src/web/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| paper (background) | #F3EFE4 | Fondo |
| sheet (card) | #FBF9F3 | Superficies |
| ink (foreground) | #16150F | Texto, botones primarios |
| graphite (muted-fg) | #6B675A | Texto secundario |
| rule (border) | #D9D2BF | Líneas/hairlines |
| red pencil (primary accent) | #E2401C | Acento, timer, CTA |

Tipos de error: Vacío conceptual #E2401C · Trampa del distractor #D99A06 · Falta de tiempo/Adivinanza #2F5DA8.
Materias: Matemáticas #16150F · Lectura Crítica #7A4E2D · Ciencias Naturales #2E7D4F · Sociales #8C3B6E · Inglés #2F5DA8.

## Tipografía

- Display: **Bricolage Grotesque** (700/800), titulares y cifras grandes.
- Body: **Poppins** (400/500/600).
- Datos/números/atajos: **JetBrains Mono**.

## Páginas

- `/` — Inicio: lista de simulacros, crear nuevo, evolución entre simulacros, respaldo (exportar/importar JSON, CSV global).
- `/s/:id` — Simulacro en vivo: temporizador, panel de captura (materia sticky, número, tipo = registra), tabla en vivo, estadísticas y diagnóstico.
- `/s/:id/reporte` — Reporte imprimible (PDF vía imprimir) + CSV.

## Flujos clave

1. Crear simulacro → iniciar temporizador → por cada fallo: materia (sticky) + nº pregunta + tipo (1 toque guarda).
2. Atajos: M/L/C/S/I materia · dígitos = nº pregunta · V/D/T registran · Z deshace · Espacio inicia/pausa · Esc limpia.
3. Al terminar → Analítica + diagnóstico → Reporte PDF/CSV. Inicio muestra evolución.

## Arquitectura

App estática (deploy Netlify). Persistencia local en `localStorage` detrás de un repositorio (`lib/store.ts`)
con interfaz síncrona y suscripción (`useSyncExternalStore`) — intercambiable por API remota en el futuro.
