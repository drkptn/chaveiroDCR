import * as THREE from "three";

export type P2 = [number, number];

export const v2 = (p: P2) => new THREE.Vector2(p[0], p[1]);

/** Polígono → Shape (com furos opcionais). */
export function shapeOf(points: P2[], holes: P2[][] = []) {
  const s = new THREE.Shape(points.map(v2));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(v2)));
  return s;
}

/** Extrusão centrada em Z, com chanfro arredondado que preserva a silhueta. */
export function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, bevel = 0.02, segments = 3, curveSegments = 24) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: segments,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Pontos de um círculo (sentido anti-horário). */
export function circle(cx: number, cy: number, r: number, n = 32, reverse = false): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * (reverse ? -1 : 1);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** Retângulo arredondado (anti-horário). */
export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number, n = 6): P2[] {
  const pts: P2[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return pts;
}

/** Faixa com pontas arredondadas (furo de sulco). */
export function slot(x0: number, x1: number, yc: number, h: number, n = 8): P2[] {
  const r = h / 2;
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    pts.push([x1 - r + Math.cos(a) * r, yc + Math.sin(a) * r]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI;
    pts.push([x0 + r + Math.cos(a) * r, yc + Math.sin(a) * r]);
  }
  return pts;
}

/** Hélice para molas — eixo Y, de 0 a 1 (escalável). */
export class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    public radius = 0.09,
    public turns = 9,
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2 * this.turns;
    return target.set(Math.cos(a) * this.radius, t, Math.sin(a) * this.radius);
  }
}

export function springGeometry(radius = 0.09, wire = 0.016, turns = 9) {
  return new THREE.TubeGeometry(new Helix(radius, turns), turns * 22, wire, 6, false);
}

/** Pino de cilindro (torno): base plana, corpo, ponta cônica opcional. Eixo Y, base em y=0. */
export function pinGeometry(length: number, r = 0.1, pointed = true) {
  const tip = pointed ? Math.min(0.12, length * 0.35) : 0.025;
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r - 0.018, 0),
    new THREE.Vector2(r, 0.018),
    new THREE.Vector2(r, length - tip),
    pointed ? new THREE.Vector2(r * 0.28, length - 0.006) : new THREE.Vector2(r - 0.02, length),
    new THREE.Vector2(0, length),
  ];
  return new THREE.LatheGeometry(pts, 28);
}

/** Parafuso de cabeça redonda com fenda Torx (simplificada). */
export function screwGroup(material: THREE.Material, dark: THREE.Material) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.26, 0),
        new THREE.Vector2(0.26, 0.05),
        new THREE.Vector2(0.2, 0.14),
        new THREE.Vector2(0.08, 0.17),
        new THREE.Vector2(0, 0.17),
      ],
      32,
    ),
    material,
  );
  g.add(head);
  const star = new THREE.Shape();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.1 : 0.06;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const recess = new THREE.Mesh(new THREE.ShapeGeometry(star), dark);
  recess.rotation.x = -Math.PI / 2;
  recess.position.y = 0.171;
  g.add(recess);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16), material);
  shaft.position.y = -0.4;
  g.add(shaft);
  // rosca: anéis finos
  for (let i = 0; i < 7; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 20), material);
    t.rotation.x = Math.PI / 2;
    t.position.y = -0.12 - i * 0.1;
    g.add(t);
  }
  return g;
}

/** Engrenagem de dentes trapezoidais (anti-horário). */
export function gearShape(teeth: number, rPitch: number, toothH = 0.12, holeR = 0.2, spokes = 0): THREE.Shape {
  const pts: P2[] = [];
  const rOut = rPitch + toothH * 0.5;
  const rIn = rPitch - toothH * 0.6;
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    pts.push([Math.cos(a - step * 0.3) * rIn, Math.sin(a - step * 0.3) * rIn]);
    pts.push([Math.cos(a - step * 0.16) * rOut, Math.sin(a - step * 0.16) * rOut]);
    pts.push([Math.cos(a + step * 0.16) * rOut, Math.sin(a + step * 0.16) * rOut]);
    pts.push([Math.cos(a + step * 0.3) * rIn, Math.sin(a + step * 0.3) * rIn]);
  }
  const holes: P2[][] = [circle(0, 0, holeR, 24, true)];
  if (spokes > 0) {
    const r0 = holeR + 0.12;
    const r1 = rIn - 0.1;
    for (let s = 0; s < spokes; s++) {
      const a0 = (s / spokes) * Math.PI * 2 + 0.22;
      const a1 = ((s + 1) / spokes) * Math.PI * 2 - 0.22;
      const win: P2[] = [];
      const n = 10;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        win.push([Math.cos(a) * r1, Math.sin(a) * r1]);
      }
      for (let i = n; i >= 0; i--) {
        const a = a0 + 0.12 + ((a1 - a0 - 0.24) * i) / n;
        win.push([Math.cos(a) * r0, Math.sin(a) * r0]);
      }
      holes.push(win.reverse());
    }
  }
  return shapeOf(pts, holes);
}

/** Limalha: fita curvada (para partículas instanciadas). */
export function shavingGeometry() {
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: 8 }, (_, i) => {
      const t = i / 7;
      const a = t * Math.PI * 2.4;
      return new THREE.Vector3(Math.cos(a) * 0.08 * (1 - t * 0.4), t * 0.22, Math.sin(a) * 0.08 * (1 - t * 0.4));
    }),
  );
  return new THREE.TubeGeometry(curve, 24, 0.012, 4, false);
}
