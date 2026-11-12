import { cylinderParts } from "@/config/content";

/**
 * Estados compartilhados entre DOM e cenas 3D — módulo leve, sem three.js,
 * para que o pacote 3D só seja baixado quando a cena for montada.
 */
export const explodedState = {
  p: 0,
  focus: -1,
  xray: false,
  anchors: cylinderParts.map(() => ({ x: 0, y: 0, z: 0 })),
  w: 1,
  h: 1,
};

export const ringState = {
  selected: 0,
  /** arrasto do usuário (rad), somado à rotação alvo */
  drag: 0,
  dragging: false,
};
