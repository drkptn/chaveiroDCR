import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { SYMBOL_PATH } from "@/components/brand/logoPaths";
import { mat } from "../materials";
import { circle, extrude, gearShape, roundRect, screwGroup, shapeOf, type P2 } from "./geo";
import { buildKey, flatKey, flipKey, heroKey } from "./keys";
import { buildCylinder, CYL } from "./cylinder";

/** Leque de chaves — categoria "Cópias". */
export function keyFan() {
  const g = new THREE.Group();
  const a = buildKey("yale");
  const b = buildKey("tetra");
  const c = flatKey({ faces: "dimples", tip: "round", bow: "square", bowR: 0.86, yTop: 0.36, yBot: -0.36, material: "satin" });
  a.group.position.set(0.2, 0.55, 0.3);
  a.group.rotation.set(0.1, 0, 0.32);
  b.group.position.set(0.1, -0.1, -0.2);
  b.group.rotation.set(0.6, 0, 0.02);
  c.group.position.set(0.3, -0.75, -0.6);
  c.group.rotation.set(-0.2, 0, -0.3);
  g.add(a.group, b.group, c.group);
  return g;
}

/** Fechadura de embutir em corte — categoria "Abertura de portas". */
export function mortiseLock() {
  const g = new THREE.Group();
  const steel = mat("darkSteel");
  const satin = mat("satin");
  // testa
  const face = new THREE.Mesh(extrude(shapeOf(roundRect(-0.08, -2.3, 0.08, 2.3, 0.06)), 0.95, 0.02), satin);
  face.rotation.y = Math.PI / 2;
  face.position.x = 0.0;
  // caixa (bandeja aberta)
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.9, 0.06), steel);
  back.position.set(-1.38, 0, -0.42);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 0.84), steel);
  top.position.set(-1.38, 1.92, 0);
  const bottom = top.clone();
  bottom.position.y = -1.92;
  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.9, 0.84), steel);
  rear.position.set(-2.72, 0, 0);
  g.add(face, back, top, bottom, rear);
  // lingueta (ferrolho) — latão, saindo pela testa
  const bolt = new THREE.Mesh(extrude(shapeOf(roundRect(-1.6, -0.26, 0.85, 0.26, 0.05)), 0.42, 0.03), mat("brass"));
  bolt.position.set(0, 0.95, 0);
  // trinco chanfrado
  const latchPts: P2[] = [
    [-1.2, -0.24],
    [0.75, -0.24],
    [0.75, 0.0],
    [0.45, 0.24],
    [-1.2, 0.24],
  ];
  const latch = new THREE.Mesh(extrude(shapeOf(latchPts), 0.42, 0.03), mat("chrome"));
  latch.position.set(0, -0.95, 0);
  g.add(bolt, latch);
  // engrenagem e cubo da maçaneta
  const gear = new THREE.Mesh(extrude(gearShape(14, 0.48, 0.14, 0.12, 4), 0.14, 0.012), mat("brass"));
  gear.position.set(-1.25, 0.2, -0.1);
  const follower = new THREE.Mesh(extrude(shapeOf(circle(0, 0, 0.36, 40), [[[-0.13, -0.13], [-0.13, 0.13], [0.13, 0.13], [0.13, -0.13]]]), 0.5, 0.03), satin);
  follower.position.set(-1.25, -0.95, 0);
  g.add(gear, follower);
  // molas planas
  const springCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.6, -1.5, 0),
    new THREE.Vector3(-2.2, -1.2, 0),
    new THREE.Vector3(-1.9, -1.45, 0),
    new THREE.Vector3(-1.5, -1.2, 0),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(springCurve, 40, 0.035, 8), satin));
  // cilindro europeu atravessando
  const cyl = buildCylinder("solid");
  cyl.root.scale.setScalar(0.42);
  cyl.root.rotation.y = -Math.PI / 2;
  cyl.root.position.set(-1.25, 0.3, 0.75);
  // não usado como mecanismo animado aqui — só presença
  g.add(cyl.root);
  // parafusos da testa
  [1.8, -1.8].forEach((y) => {
    const s = screwGroup(mat("chrome"), mat("darkSteel"));
    s.scale.setScalar(0.5);
    s.rotation.z = -Math.PI / 2;
    s.position.set(0.1, y, 0);
    g.add(s);
  });
  return g;
}

/** Fechadura digital — categoria "Segurança". */
export function digitalLock() {
  const g = new THREE.Group();
  const bezel = new THREE.Mesh(extrude(shapeOf(roundRect(-0.95, -2.5, 0.95, 2.5, 0.42)), 0.24, 0.06), mat("chrome"));
  const panel = new THREE.Mesh(extrude(shapeOf(roundRect(-0.82, -2.36, 0.82, 2.36, 0.34)), 0.12, 0.04), mat("plastic"));
  panel.position.z = 0.12;
  g.add(bezel, panel);
  const glow = mat("glow");
  // teclado 3x4
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const k = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 6, 24), glow);
      k.position.set(-0.46 + c * 0.46, 1.62 - r * 0.42, 0.205);
      g.add(k);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), glow);
      dot.position.set(k.position.x, k.position.y, 0.206);
      g.add(dot);
    }
  }
  // leitor biométrico
  const reader = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 40), mat("smoke"));
  reader.rotation.x = Math.PI / 2;
  reader.position.set(0, -0.32, 0.2);
  g.add(reader);
  [0.1, 0.17, 0.24].forEach((r) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.006, 4, 40), glow);
    ring.position.set(0, -0.32, 0.235);
    g.add(ring);
  });
  // maçaneta
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 40), mat("chrome"));
  rose.rotation.x = Math.PI / 2;
  rose.position.set(0, -1.45, 0.3);
  const lever = new THREE.Mesh(extrude(shapeOf(roundRect(-0.12, -0.13, 2.0, 0.13, 0.12)), 0.22, 0.06), mat("chrome"));
  lever.position.set(0, -1.45, 0.62);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 24), mat("chrome"));
  neck.rotation.x = Math.PI / 2;
  neck.position.set(0, -1.45, 0.5);
  g.add(rose, lever, neck);
  // led de status
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), glow);
  led.position.set(0.55, 2.0, 0.21);
  g.add(led);
  return g;
}

/** Símbolo DCR em 3D (extrusão do SVG do logotipo). */
export function emblem(depth = 6) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill-rule="evenodd" d="${SYMBOL_PATH}"/></svg>`;
  const data = new SVGLoader().parse(svg);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: 1.1,
    bevelSize: 0.7,
    bevelOffset: -0.7,
    bevelSegments: 4,
    curveSegments: 32,
  });
  geo.center();
  geo.scale(1 / 22, -1 / 22, -1 / 22);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat("chrome"));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Cilindro sólido com a chave parcialmente inserida — categoria "Fechaduras". */
export function cylinderWithKey(insert = 1) {
  const g = new THREE.Group();
  const c = buildCylinder("solid");
  const k = heroKey();
  const holder = new THREE.Group();
  holder.add(k.group);
  holder.rotation.x = Math.PI;
  holder.position.x = THREE.MathUtils.lerp(-3.5, CYL.seat, insert);
  c.update(k, holder.position.x, 0, 0);
  g.add(c.root, holder);
  g.position.x = 0.6;
  return g;
}

/** Objetos das gavetas de serviço (mesmos do estúdio de renders). */
export const SERVICE_MODELS: Record<string, { build: () => THREE.Object3D; tilt: [number, number, number]; fit: number }> = {
  copias: { build: keyFan, tilt: [0.35, 0, 0], fit: 0.82 },
  automotivas: { build: () => flipKey().group, tilt: [0.5, 0, 0.1], fit: 0.84 },
  fechaduras: { build: () => cylinderWithKey(0.55), tilt: [0.3, 0, 0], fit: 0.86 },
  abertura: { build: mortiseLock, tilt: [0.25, 0, 0], fit: 0.86 },
  seguranca: { build: digitalLock, tilt: [0.15, 0, 0], fit: 0.88 },
};
