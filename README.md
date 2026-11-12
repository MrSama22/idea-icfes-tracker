# IDEA · ICFES Diagnostic & Error Analytics Engine

Registra los errores de tus simulacros ICFES en menos de 2 segundos, clasifícalos por causa
(vacío conceptual, trampa del distractor, falta de tiempo/adivinanza) y obtén un diagnóstico
por materia y tipo de error.

## Funciones

- **Captura en 1 toque**: materia fija (sticky) + número de pregunta + tipo de error = guardado.
- **Temporizador** de simulacro (sesión 4h30m o bloques), con minuto de cada error.
- **Tabla en vivo**: filtrar por materia, cambiar el tipo con un toque, agregar notas, deshacer.
- **Analítica**: barras por materia apiladas por tipo, distribución por tipo, mapa de calor materia × tipo, errores por cuarto de tiempo.
- **Diagnóstico automático en texto** (ej. “El 65% de tus fallas en Matemáticas son por vacío conceptual”) con recomendaciones.
- **Evolución entre simulacros**: errores por simulacro, % de acierto estimado y tendencia por materia.
- **Exportación**: reporte imprimible a PDF, CSV por simulacro o global, y respaldo/importación JSON.

### Atajos de teclado (PC)

| Tecla | Acción |
|---|---|
| `M` `L` `C` `S` `I` | Matemáticas, Lectura, Ciencias, Sociales, Inglés |
| `0-9` | Número de pregunta |
| `V` `D` `T` | Registrar: Vacío, Distractor, Tiempo |
| `N` | Nota opcional |
| `Z` | Deshacer último |
| `Espacio` | Iniciar / pausar temporizador |
| `Esc` | Limpiar número |

## Arquitectura

Monorepo Bun + Vite + React 19 + Tailwind 4. La app es una SPA estática; la persistencia está en
`localStorage` detrás de un repositorio (`packages/web/src/web/lib/store.ts`) con la misma forma que una API REST
(`registrarError` ≈ `POST /api/errores`, `estadisticas()` ≈ `GET /api/estadisticas/{id}`), así que se puede
cambiar a un backend remoto sin tocar la UI.

```
packages/web/src/web/
  lib/domain.ts      Modelos (Simulacro, ErrorRegistrado), materias y tipos
  lib/store.ts       Repositorio local + suscripción
  lib/analytics.ts   Estadísticas y motor de diagnóstico
  lib/export.ts      CSV / descargas
  components/        Captura, temporizador, tabla, gráficos
  pages/             Inicio, Simulacro en vivo, Reporte
```

## Desarrollo

```bash
bun install
bun run dev        # http://localhost:4200
bun run build:web  # genera packages/web/dist
```

## Deploy en Netlify

`netlify.toml` ya está configurado: conecta el repo en Netlify y se construye solo
(`bun run build:web`, publica `packages/web/dist`, redirección SPA).
