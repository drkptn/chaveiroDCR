/**
 * Silhueta do cilindro de perfil europeu (a mesma do 3D) em SVG — usada como
 * máscara do "portal" entre o hero e os serviços. Unidades: raio do corpo = 0.85.
 */
const R = 0.85;
const HALF = 0.5;
const BOTTOM = 2.45; // y para baixo (SVG)

export const KEYHOLE_BOX = { x: -R, y: -R, w: R * 2, h: R + BOTTOM };
/** fração da altura onde fica o centro do círculo */
export const KEYHOLE_CENTER = R / (R + BOTTOM);

export function keyholePath() {
  const yJoin = Math.sqrt(R * R - HALF * HALF);
  const r = 0.12;
  return [
    `M ${HALF} ${yJoin.toFixed(4)}`,
    `A ${R} ${R} 0 1 0 ${-HALF} ${yJoin.toFixed(4)}`,
    `L ${-HALF} ${BOTTOM - r}`,
    `Q ${-HALF} ${BOTTOM} ${-HALF + r} ${BOTTOM}`,
    `L ${HALF - r} ${BOTTOM}`,
    `Q ${HALF} ${BOTTOM} ${HALF} ${BOTTOM - r}`,
    "Z",
  ].join(" ");
}

export function keyholeDataUri() {
  const { x, y, w, h } = KEYHOLE_BOX;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none"><path fill="#fff" d="${keyholePath()}"/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
