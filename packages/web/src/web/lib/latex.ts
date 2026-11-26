// Los modelos a veces escriben LaTeX sin los delimitadores $…$ ("800.000 \left(\frac{5}{100}\right)^n").
// Aquí se detectan esos comandos sueltos y se encierran en $…$ para que KaTeX los dibuje.

const LETRA = /[A-Za-zÁÉÍÓÚÜáéíóúüÑñ]/;
const OPERADOR = /[=+\-*/<>×÷·^_]/;

/** Posición donde termina la fórmula que empieza en `i` (índice del primer comando LaTeX). */
function finDeMath(t: string, i: number) {
  let llaves = 0;
  let parens = 0;
  let corchetes = 0;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+)/.exec(t.slice(j, j + 24));
      j += m ? m[0].length - 1 : 1; // un comando entero, o el carácter escapado
      continue;
    }
    if (c === "{") llaves++;
    else if (c === "(") parens++;
    else if (c === "[") corchetes++;
    else if (c === "}" || c === ")" || c === "]") {
      if (c === "}" && llaves === 0) return j;
      if (c === ")" && parens === 0) return j;
      if (c === "]" && corchetes === 0) return j;
      if (c === "}") llaves--;
      else if (c === ")") parens--;
      else corchetes--;
    }
    if (llaves || parens || corchetes) continue;
    if (/\s/.test(c)) continue;

    // ¿la fórmula sigue después de este carácter?
    const resto = t.slice(j + 1);
    const sig = resto[0];
    if (sig === undefined) return j + 1;
    if (!/\s/.test(sig)) {
      if (/([.,])(?=[0-9])/.test(sig + (resto[1] ?? ""))) continue; // decimal pegado
      if (/[0-9A-Za-z{}()\[\]^_+\-*/=<>|!·×÷%]/.test(sig)) continue;
      return j + 1;
    }
    // separada por espacio: solo sigue si viene un operador suelto, más LaTeX o un número tras un operador
    const palabra = /^\s+(\S+)/.exec(resto)?.[1] ?? "";
    if (/^[=+\-*/<>×÷·^_]$/.test(palabra) || /^\\[a-zA-Z]+/.test(palabra)) continue;
    if (/^[=+\-*/<>×÷·]$/.test(c) && /^([0-9]+([.,][0-9]+)?|[A-Za-z])$/.test(palabra)) continue;
    return j + 1;
  }
  return t.length;
}

/** Posición donde empieza la fórmula: se come también el número u operador que la precede (800.000, 2x, =). */
function inicioDeMath(t: string, i: number) {
  let j = i;
  for (;;) {
    let k = j;
    while (k > 0 && (t[k - 1] === " " || t[k - 1] === "\t")) k--;
    if (k === 0 || t[k - 1] === "\n") break;
    const antes = t[k - 1];
    if (/[0-9.,]/.test(antes)) {
      let m = k;
      while (m > 0 && /[0-9.,]/.test(t[m - 1])) m--;
      // pegado a una palabra ("pregunta5") no es una cifra de la fórmula
      if (m > 0 && (LETRA.test(t[m - 1]) || /[0-9]/.test(t[m - 1]))) break;
      j = m;
      continue;
    }
    if (OPERADOR.test(antes) || antes === "(") {
      // una viñeta de lista ("- \\frac{…}") no es parte de la fórmula
      if ((antes === "-" || antes === "*") && (k === 1 || t[k - 2] === "\n" || /\n\s*$/.test(t.slice(0, k - 1)))) break;
      j = k - 1;
      continue;
    }
    if (LETRA.test(antes)) {
      let m = k;
      while (m > 0 && LETRA.test(t[m - 1])) m--;
      const suelta = t.slice(m, k).toLowerCase();
      // una variable suelta (x, n, m…) sí; una palabra ("costo") o un "y" de enlace no
      if (k - m === 1 && !["y", "o", "a", "e", "u"].includes(suelta)) {
        j = m;
        continue;
      }
    }
    break;
  }
  return j;
}

/** Cierre de una fórmula ya delimitada, respetando \$ y $$…$$. */
function cierreDeMath(t: string, desde: number, delim: "$" | "$$") {
  for (let j = desde; j < t.length; j++) {
    if (t[j] === "\\") {
      j++;
      continue;
    }
    if (t[j] === "$" && (delim === "$" || t[j + 1] === "$")) return j;
  }
  return -1;
}

/**
 * Encierra en $…$ los comandos LaTeX que vengan sueltos, sin tocar lo que ya está delimitado
 * ni el código en línea. Sirve para preguntas viejas o mal transcritas.
 */
export function envolverLatex(texto: string) {
  if (!texto || !/\\[a-zA-Z]/.test(texto)) return texto;
  let salida = "";
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "`") {
      const fin = texto.indexOf("`", i + 1);
      const hasta = fin === -1 ? texto.length : fin + 1;
      salida += texto.slice(i, hasta);
      i = hasta;
      continue;
    }
    if (c === "\\" && texto[i + 1] === "$") {
      salida += "\\$";
      i += 2;
      continue;
    }
    if (c === "$") {
      const delim = texto[i + 1] === "$" ? "$$" : "$";
      const fin = cierreDeMath(texto, i + delim.length, delim);
      const hasta = fin === -1 ? texto.length : fin + delim.length;
      salida += texto.slice(i, hasta);
      i = hasta;
      continue;
    }
    if (c === "\\" && /[a-zA-Z]/.test(texto[i + 1] ?? "")) {
      const inicio = inicioDeMath(texto, i);
      const fin = finDeMath(texto, i);
      const previo = texto.slice(inicio, i);
      if (previo && salida.endsWith(previo)) salida = salida.slice(0, salida.length - previo.length);
      salida += `$${texto.slice(inicio, fin)}$`;
      i = fin;
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}
