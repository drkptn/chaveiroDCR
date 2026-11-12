import * as THREE from "three";
import { mat, withEdges, edgeMaterial } from "../materials";
import { circle, extrude, pinGeometry, shapeOf, springGeometry, type P2 } from "./geo";
import { HERO_CUTS, type KeyBuild } from "./keys";

/**
 * Cilindro de perfil europeu, eixo +X, face frontal em x=0.
 * Pinos ficam na "haste" inferior; a chave entra com o segredo para baixo.
 * Medidas pensadas para casar com heroKey(): cortes em u = 0.45 + i·0.5.
 */
export const CYL = {
  L: 3.1,
  rBody: 0.85,
  stemHalf: 0.5,
  bottom: -2.45,
  rPlug: 0.6,
  shear: -0.6,
  chamberBottom: -2.25,
  restTop: 0.04,
  driverLen: 0.42,
  /** posição do ombro da chave quando totalmente inserida */
  seat: -0.08,
};

export const PIN_X = HERO_CUTS.map((_, i) => 0.45 + i * 0.5 + CYL.seat);
/** comprimento de cada pino inferior: do fundo do corte até a linha de corte */
export const KEY_PIN_LEN = HERO_CUTS.map((d) => 0.18 + d);

function euroProfile(): P2[] {
  const { rBody, stemHalf, bottom } = CYL;
  const yJoin = -Math.sqrt(rBody * rBody - stemHalf * stemHalf);
  const a0 = Math.atan2(yJoin, stemHalf);
  const a1 = Math.atan2(yJoin, -stemHalf) + Math.PI * 2;
  const pts: P2[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([Math.cos(a) * rBody, Math.sin(a) * rBody]);
  }
  const r = 0.12;
  pts.push([-stemHalf, bottom + r]);
  for (let i = 1; i <= 6; i++) {
    const a = Math.PI + (i / 6) * (Math.PI / 2);
    pts.push([-stemHalf + r + Math.cos(a) * r, bottom + r + Math.sin(a) * r]);
  }
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 1.5 + (i / 6) * (Math.PI / 2);
    pts.push([stemHalf - r + Math.cos(a) * r, bottom + r + Math.sin(a) * r]);
  }
  return pts;
}

/** Perfil europeu normalizado (usado também na máscara-portal do DOM). */
export const EURO_PROFILE = euroProfile();

function keywayPoints(): P2[] {
  return [
    [-0.12, 0.42],
    [0.12, 0.42],
    [0.12, 0.2],
    [0.06, 0.12],
    [0.14, 0.02],
    [0.14, -0.2],
    [0.08, -0.28],
    [0.14, -0.36],
    [0.14, -0.5],
    [-0.13, -0.5],
    [-0.13, -0.3],
    [-0.07, -0.22],
    [-0.14, -0.1],
    [-0.14, 0.12],
    [-0.08, 0.18],
    [-0.12, 0.26],
  ];
}

/** Gira um mesh extrudado (plano XY, extrusão Z) para ficar perpendicular ao eixo X. */
function alongX(mesh: THREE.Object3D, x: number) {
  mesh.rotation.y = Math.PI / 2;
  mesh.position.x = x;
  return mesh;
}

export type CylinderVariant = "glass" | "solid";

export type CylinderBuild = ReturnType<typeof buildCylinder>;

export function buildCylinder(variant: CylinderVariant = "glass") {
  const { L, rPlug, shear, chamberBottom, restTop, driverLen } = CYL;
  const root = new THREE.Group();
  const body = new THREE.Group();
  const plug = new THREE.Group();
  const cam = new THREE.Group();
  root.add(body, plug);
  plug.add(cam);

  const edges: THREE.LineSegments[] = [];
  const profile = euroProfile();
  const bore: P2[] = circle(0, 0, rPlug + 0.02, 48, true);

  // ---------- corpo ----------
  const housingMat = variant === "glass" ? mat("glass") : mat("brushed");
  const housing = alongX(new THREE.Mesh(extrude(shapeOf(profile, [bore]), L, variant === "glass" ? 0 : 0.03), housingMat), L / 2) as THREE.Mesh;
  housing.renderOrder = 2;
  body.add(housing);
  edges.push(withEdges(housing, 30));

  const collarMat = mat(variant === "glass" ? "chrome" : "satin");
  const frontCollar = alongX(new THREE.Mesh(extrude(shapeOf(profile, [bore]), 0.1, 0.03), collarMat), -0.02);
  const backCollar = alongX(new THREE.Mesh(extrude(shapeOf(profile, [bore]), 0.1, 0.03), collarMat), L + 0.02);
  body.add(frontCollar, backCollar);

  // furo do parafuso de fixação (anel decorativo na haste)
  const screwRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 10, 28), mat("chrome"));
  screwRing.position.set(L / 2, -1.55, 0.5);
  if (variant === "solid") body.add(screwRing);

  // câmaras dos pinos
  const chambers: THREE.Mesh[] = [];
  PIN_X.forEach((x) => {
    const h = Math.abs(chamberBottom - shear) + 0.05;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, h, 20, 1, true), variant === "glass" ? mat("glass") : mat("darkSteel"));
    tube.position.set(x, chamberBottom + h / 2, 0);
    if (variant === "glass") {
      body.add(tube);
      chambers.push(tube);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 20), mat("satin"));
    cap.position.set(x, chamberBottom - 0.03, 0);
    body.add(cap);
    chambers.push(cap);
  });

  // ---------- rotor ----------
  const plugMat =
    variant === "glass"
      ? new THREE.MeshPhysicalMaterial({
          color: "#e3c27f",
          metalness: 0.5,
          roughness: 0.1,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          envMapIntensity: 1.8,
          side: THREE.DoubleSide,
        })
      : mat("brass");
  const plugMesh = new THREE.Mesh(new THREE.CylinderGeometry(rPlug, rPlug, L - 0.05, 56, 1, variant === "glass"), plugMat);
  plugMesh.rotation.z = Math.PI / 2;
  plugMesh.position.x = (L - 0.05) / 2 + 0.03;
  plugMesh.renderOrder = 3;
  plug.add(plugMesh);
  edges.push(withEdges(plugMesh, 40));

  const face = alongX(new THREE.Mesh(extrude(shapeOf(circle(0, 0, rPlug, 56), [keywayPoints()]), 0.08, 0.02), mat("brass")), -0.04);
  plug.add(face);

  // ---------- came ----------
  const camPts: P2[] = [];
  const hub = 0.52;
  for (let i = 0; i <= 40; i++) {
    const a = -Math.PI / 3 + (i / 40) * (Math.PI * 2 - Math.PI / 3);
    camPts.push([Math.cos(a) * hub, Math.sin(a) * hub]);
  }
  camPts.push([-0.24, -1.05]);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    camPts.push([Math.cos(a) * 0.24, -1.05 + Math.sin(a) * 0.24]);
  }
  camPts.push([0.24, -1.05]);
  const camMesh = alongX(
    new THREE.Mesh(extrude(shapeOf(camPts, [[[-0.14, -0.14], [-0.14, 0.14], [0.14, 0.14], [0.14, -0.14]]]), 0.2, 0.03), mat("satin")),
    L + 0.22,
  );
  cam.add(camMesh);

  // ---------- pinos e molas ----------
  const keyPinMat = mat("brass");
  const driverMat = mat("chrome");
  const springMat = mat("satin");
  const keyPinLen = KEY_PIN_LEN;
  const keyPins: THREE.Mesh[] = [];
  const driverPins: THREE.Mesh[] = [];
  const springs: THREE.Mesh[] = [];
  const springGeo = springGeometry(0.085, 0.015, 9);
  PIN_X.forEach((x, i) => {
    const kp = new THREE.Mesh(pinGeometry(keyPinLen[i], 0.092, true), keyPinMat);
    kp.position.x = x;
    plug.add(kp);
    keyPins.push(kp);
    const dp = new THREE.Mesh(pinGeometry(driverLen, 0.092, false), driverMat);
    dp.position.x = x;
    body.add(dp);
    driverPins.push(dp);
    const sp = new THREE.Mesh(springGeo, springMat);
    sp.position.set(x, chamberBottom, 0);
    body.add(sp);
    springs.push(sp);
  });

  // ---------- linha de corte ----------
  const shearMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#5ff0ff").multiplyScalar(1.4), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const shearLine = new THREE.Mesh(new THREE.BoxGeometry(L + 0.3, 0.014, 1.12), shearMat);
  shearLine.position.set(L / 2, shear, 0);
  shearLine.renderOrder = 5;
  body.add(shearLine);

  // ---------- estado dinâmico ----------
  const pinTop = PIN_X.map(() => restTop);
  const pinVel = PIN_X.map(() => 0);

  /**
   * Atualiza pinos conforme a chave.
   * @param shoulderX posição (no eixo do cilindro) do ombro da chave
   * @param turn ângulo de giro do rotor (rad)
   * @param dt passo de tempo (s); 0 = sem física (estado exato)
   */
  function update(key: KeyBuild | null, shoulderX: number, turn: number, dt: number) {
    PIN_X.forEach((x, i) => {
      let target = restTop;
      if (key) {
        const u = x - shoulderX;
        const e = key.edgeAt(u);
        if (!Number.isNaN(e)) target = Math.min(restTop, -e);
      }
      if (turn > 0.02) target = shear + keyPinLen[i];
      if (dt <= 0) {
        pinTop[i] = target;
        pinVel[i] = 0;
      } else {
        // mola criticamente amortecida (com leve "pulo")
        const k = 900;
        const c = 38;
        const steps = Math.ceil(dt / (1 / 240));
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
          const acc = (target - pinTop[i]) * k - pinVel[i] * c;
          pinVel[i] += acc * h;
          pinTop[i] += pinVel[i] * h;
        }
      }
      const top = pinTop[i];
      const kp = keyPins[i];
      kp.position.y = top - keyPinLen[i];
      const driverTop = top - keyPinLen[i];
      driverPins[i].position.y = driverTop - driverLen;
      const springLen = Math.max(0.12, driverTop - driverLen - chamberBottom);
      springs[i].scale.y = springLen;
    });
    plug.rotation.x = turn;
  }
  update(null, -10, 0, 0);

  const parts = {
    body: [housing, frontCollar, backCollar, ...chambers, ...(variant === "solid" ? [screwRing] : [])] as THREE.Object3D[],
    plug: [plugMesh, face] as THREE.Object3D[],
    keyPins: keyPins as THREE.Object3D[],
    driverPins: driverPins as THREE.Object3D[],
    springs: springs as THREE.Object3D[],
    shear: [shearLine] as THREE.Object3D[],
    cam: [camMesh] as THREE.Object3D[],
  };

  return { pinTop, root, body, plug, cam, keyPins, driverPins, springs, shearLine, shearMat, housing, edges, update, parts, edgeMaterial };
}
