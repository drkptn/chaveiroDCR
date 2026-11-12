/**
 * Símbolo DCR — uma chave vertical.
 * A cabeça é um "D" espelhado (à esquerda) e um "R" (à direita) que dividem a mesma
 * haste; a perna do R vira o batente da chave; o furo da argola é o "C".
 * A haste desce como lâmina, com dois cortes de segredo.
 * viewBox 0 0 64 64 · regra evenodd.
 */
export const SYMBOL_VIEWBOX = "0 0 64 64";

export const SYMBOL_OUTER =
  "M27 4 L35 4 A9.5 9.5 0 0 1 35 23 L38 23 L49.5 35 L42 35 L35 28 L35 38.5 L32.2 41 L35 43.5 L35 46 L32.6 48.4 L35 50.8 L35 55 L31 61 L27 56.8 L27 33 A14.5 14.5 0 0 1 27 4 Z";

export const SYMBOL_HOLES = [
  // C — furo da argola
  "M17.6 18.5 A5.4 5.4 0 1 0 28.4 18.5 A5.4 5.4 0 1 0 17.6 18.5 Z",
  // miolo do R
  "M34 10 L35 10 A3.5 3.5 0 0 1 35 17 L34 17 Z",
];

/** Sulco da lâmina (detalhe gravado, não faz parte da silhueta). */
export const SYMBOL_GROOVE = "M29.6 30 L29.6 54.5";

export const SYMBOL_PATH = [SYMBOL_OUTER, ...SYMBOL_HOLES].join(" ");
