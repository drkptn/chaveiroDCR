/** Estado compartilhado entre o ScrollTrigger (DOM) e a cena 3D do hero. */
export const heroState = {
  /** progresso da rolagem do hero (0 → 1) */
  p: 0,
  /** suavizado dentro da cena */
  ps: 0,
  /** modo de captura do estúdio: congela a animação idle */
  frozen: false,
  /** tempo fixo usado na captura */
  t: 0,
  /** leitura dos pinos para o HUD: distância de cada pino à linha de corte */
  gaps: [0.4, 0.4, 0.4, 0.4, 0.4] as number[],
  insert: 0,
  turn: 0,
  /** face do cilindro projetada na tela (px) — alinha o portal do DOM */
  faceX: -1,
  faceY: -1,
  faceR: 0,
};

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
