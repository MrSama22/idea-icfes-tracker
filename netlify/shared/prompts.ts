// Prompts del servidor para convertir cartillas subidas por el estudiante en preguntas del banco.
export const MATS = ["MAT", "LEC", "CIE", "SOC", "ING"] as const;

export const SYS_EXTRAER = `Eres un transcriptor experto de cartillas y cuadernillos de preparación para el examen Saber 11 (ICFES, Colombia).
Transcribes con total fidelidad (sin resumir, sin corregir, sin inventar) las preguntas de selección múltiple a JSON.
Reglas:
- Usa Markdown. Tablas sencillas de texto/números como tablas Markdown.
- Matemáticas en LaTeX con $...$ (en línea) o $$...$$ (bloque). Dentro de LaTeX escribe \\% para porcentaje. NO uses $ para pesos dentro de fórmulas: escribe "pesos" o \\text{\\$}.
- Gráficas, diagramas, mapas, dibujos, esquemas, caricaturas, avisos ilustrados y tablas complejas NO se transcriben: se marcan como figura con su caja,
  y en el texto se pone el marcador {{FIG:k}} donde va la figura (k = índice dentro de esa lista de figuras, desde 0).
- box_2d = [ymin, xmin, ymax, xmax] normalizado 0-1000 sobre la imagen indicada por "pagina" (0 = primera imagen enviada, 1 = segunda). Incluye títulos, ejes y rótulos; deja un pequeño margen.
- Ignora encabezados, pies de página, números de página, logos, publicidad e instrucciones generales del examen.
- No incluyas el rótulo "Pregunta N" ni frases como "RESPONDA LAS PREGUNTAS X A Y DE ACUERDO CON..." dentro de los textos.
- Si una opción es una figura, su texto es "{{FIG:0}}" y su lista "figuras" tiene la caja.
- Responde SOLO con JSON válido.`;

export function promptExtraer(nImgs: number, materia: string | null, pagina: number, total: number) {
  return `Te envío ${nImgs} imagen(es): la página ${pagina} de ${total} de una cartilla${materia ? ` de la materia ${materia}` : ""}${nImgs > 1 ? " (imagen 0) y la página siguiente (imagen 1) solo como continuación" : " (imagen 0)"}.
Transcribe las preguntas de selección múltiple que EMPIEZAN en la imagen 0 (ignora las que vienen de una página anterior y ya empezaron arriba sin su inicio, salvo que su texto común completo esté en la imagen 0). ${nImgs > 1 ? "Si una pregunta o texto empieza en la imagen 0 y continúa en la imagen 1, complétalo con la imagen 1. No transcribas lo que empieza en la imagen 1." : ""}
Agrupa en "unidades": varias preguntas que comparten un texto, tabla o gráfica común forman UNA unidad con ese material en "contexto" (completo). Una pregunta suelta es una unidad con "contexto": null.
Si la imagen 0 contiene una CLAVE o tabla de respuestas correctas (por ejemplo "1. B, 2. C..."), devuélvela en "claves".
Formato:
{
 "materia": "MAT"|"LEC"|"CIE"|"SOC"|"ING"|null,   // Matemáticas, Lectura crítica, Ciencias naturales, Sociales y ciudadanas, Inglés
 "unidades": [{
   "contexto": string|null,
   "contexto_figuras": [{"pagina": int, "box_2d": [ymin,xmin,ymax,xmax], "descripcion": string}],
   "preguntas": [{"n": int, "enunciado": string, "figuras": [...], "opciones": [{"letra": "A", "texto": string, "figuras": [...]}], "marcada": "A"|null}]
 }],
 "claves": {"<n>": "A", ...} | {}
}
"n" es el número de la pregunta tal como aparece en la cartilla. "marcada" es la respuesta correcta SOLO si la página la indica explícitamente junto a la pregunta (p. ej. "Respuesta: C"), si no null.
"descripcion" de cada figura: describe con detalle lo que muestra (ejes, valores, rótulos) para que otro modelo pueda razonar sin verla.
Si la página no tiene preguntas (portada, instrucciones, índice), devuelve "unidades": [].`;
}

export const SYS_EXPLICAR = `Eres un profesor colombiano experto en el examen Saber 11 (ICFES). Explicas a un estudiante de grado 11 de forma MUY clara, sencilla, cálida y explícita, en español de Colombia (tuteo). Nada de jerga innecesaria.
Te doy una unidad de preguntas (transcrita de una cartilla) y, cuando existe, la respuesta correcta de la cartilla. Si te doy la clave, es la correcta: explica por qué. Si NO hay clave, resuelve la pregunta con mucho cuidado y decide tú la respuesta correcta.
Para matemáticas y ciencias muestra el procedimiento paso a paso con los números concretos. Usa Markdown; fórmulas en LaTeX con $...$ (no uses $ para pesos dentro de fórmulas). No te autocorrijas en el texto. Responde SOLO JSON válido.`;

export function promptExplicar(unidad: unknown, claves: Record<string, string | null>, temas: string) {
  return `Unidad (JSON):
${JSON.stringify(unidad, null, 1)}

Claves de la cartilla: ${JSON.stringify(claves)}

Temas posibles (elige el id que mejor encaje):
${temas}

Para CADA pregunta devuelve:
{"preguntas":[{
 "n": int,
 "clave": "A"|"B"|...,   // la clave dada, o la que tú determinaste
 "tema": "<id de la lista>",
 "subtema": "frase corta",
 "resumen": "qué pide la pregunta en una frase sencilla",
 "explicacion": "Markdown. Por qué la respuesta correcta es correcta, paso a paso, explícito y fácil (3-8 pasos o párrafos cortos).",
 "opciones": {"A": "por qué es correcta o por qué NO lo es (1-3 frases)", ...},
 "trampa": "qué hace atractiva la opción incorrecta más tentadora y cómo no caer",
 "que_mejorar": "si fallaste, qué estudiar o practicar exactamente (2-4 frases)",
 "estrategia": "truco rápido para este tipo de pregunta (1-2 frases)",
 "dificultad": 1|2|3,
 "segundos": int
}],
 "segundos_contexto": int
}`;
}
