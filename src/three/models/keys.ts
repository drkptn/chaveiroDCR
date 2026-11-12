import * as THREE from "three";
import type { KeyModel } from "@/config/keys";
import { mat, type MatKey } from "../materials";
import { circle, extrude, roundRect, shapeOf, slot, type P2 } from "./geo";

/**
 * Chaves procedurais. Convenção: lâmina ao longo de +X (ombro em x=0, ponta em x=L),
 * cabeça em x<0, espessura em Z. Segredo (cortes) na borda superior (+Y).
 */
export type KeyBuild = {
  group: THREE.Group;
  /** altura da borda de segredo (local) na posição u da lâmina */
  edgeAt: (u: number) => number;
  length: number;
  cutsU: number[];
  cutDepths: number[];
  yTop: number;
  /** centro visual (para girar no próprio eixo) */
  center: THREE.Vector3;
};

type Bow = "round" | "square" | "hex" | "none";
type Faces = "grooves" | "dimples" | "track" | "plain";

export type FlatKeyOpts = {
  L?: number;
  yTop?: number;
  yBot?: number;
  cuts?: number[];
  bottomCuts?: number[];
  cutStart?: number;
  pitch?: number;
  flat?: number;
  slope?: number;
  tip?: "point" | "round";
  bow?: Bow;
  bowR?: number;
  faces?: Faces;
  material?: MatKey;
  neck?: number;
  hole?: boolean;
};

export function flatKey(o: FlatKeyOpts = {}): KeyBuild {
  const L = o.L ?? 3;
  const yTop = o.yTop ?? 0.42;
  const yBot = o.yBot ?? -0.36;
  const cuts = o.cuts ?? [];
  const bcuts = o.bottomCuts ?? [];
  const cutStart = o.cutStart ?? 0.45;
  const pitch = o.pitch ?? 0.5;
  const flat = o.flat ?? 0.07;
  const slope = o.slope ?? 1.15;
  const tip = o.tip ?? "point";
  const ym = (yTop + yBot) / 2;
  const cutsU = cuts.map((_, i) => cutStart + i * pitch);
  const bcutsU = bcuts.map((_, i) => cutStart + 0.25 + i * pitch);

  const rTip = (yTop - yBot) / 2;
  const tipLen = 0.32;

  const top = (u: number) => {
    let y = yTop;
    cuts.forEach((d, i) => {
      y = Math.min(y, yTop - d + Math.max(0, Math.abs(u - cutsU[i]) - flat / 2) * slope);
    });
    if (tip === "point") {
      const ts = L - tipLen;
      if (u > ts) y = Math.min(y, yTop - (u - ts) * ((yTop - (ym + 0.05)) / tipLen));
    } else {
      const c = L - rTip;
      if (u > c) y = Math.min(y, ym + Math.sqrt(Math.max(0, rTip * rTip - (u - c) ** 2)));
    }
    return y;
  };
  const bot = (u: number) => {
    let y = yBot;
    bcuts.forEach((d, i) => {
      y = Math.max(y, yBot + d - Math.max(0, Math.abs(u - bcutsU[i]) - flat / 2) * slope);
    });
    if (tip === "point") {
      const ts = L - 0.2;
      if (u > ts) y = Math.max(y, yBot + (u - ts) * ((ym + 0.03 - yBot) / 0.2));
    } else {
      const c = L - rTip;
      if (u > c) y = Math.max(y, ym - Math.sqrt(Math.max(0, rTip * rTip - (u - c) ** 2)));
    }
    return y;
  };

  // amostragem densa + quebras exatas
  const us = new Set<number>();
  for (let u = 0; u <= L + 1e-6; u += 0.02) us.add(+u.toFixed(4));
  [...cutsU, ...bcutsU].forEach((c) => {
    us.add(+(c - flat / 2).toFixed(4));
    us.add(+(c + flat / 2).toFixed(4));
  });
  us.add(L);
  const U = [...us].filter((u) => u >= 0 && u <= L).sort((a, b) => a - b);

  const neck = o.neck ?? 0.3;
  const neckTop = yTop + 0.12;
  const neckBot = yBot - 0.12;
  const pts: P2[] = [];
  for (const u of U) pts.push([u, bot(u)]);
  for (let i = U.length - 1; i >= 0; i--) pts.push([U[i], top(U[i])]);
  pts.push([0, neckTop], [-neck, neckTop]);

  // cabeça
  const bow = o.bow ?? "round";
  const R = o.bowR ?? 1.02;
  let holeC: P2 = [-neck - R * 1.25, ym];
  if (bow === "round") {
    const cx = -neck - R * 0.92;
    const cy = ym;
    const e = Math.asin(THREE.MathUtils.clamp((neckTop - cy) / R, -1, 1));
    const s = Math.asin(THREE.MathUtils.clamp((neckBot - cy) / R, -1, 1)) + Math.PI * 2;
    const n = 56;
    for (let i = 1; i < n; i++) {
      const a = e + ((s - e) * i) / n;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    holeC = [cx - R * 0.42, cy];
  } else if (bow === "square" || bow === "hex") {
    const bx1 = -neck;
    const bx0 = bx1 - R * 2.05;
    const by0 = ym - R * 0.92;
    const by1 = ym + R * 0.92;
    if (bow === "square") {
      const r = R * 0.38;
      const arc = (cx: number, cy: number, a0: number) => {
        for (let i = 0; i <= 8; i++) {
          const a = a0 + (i / 8) * (Math.PI / 2);
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
      };
      arc(bx1 - r, by1 - r, 0);
      arc(bx0 + r, by1 - r, Math.PI / 2);
      arc(bx0 + r, by0 + r, Math.PI);
      arc(bx1 - r, by0 + r, (Math.PI * 3) / 2);
    } else {
      const c = R * 0.55;
      pts.push(
        [bx1, by1 - c],
        [bx1 - c, by1],
        [bx0 + c, by1],
        [bx0, by1 - c],
        [bx0, by0 + c],
        [bx0 + c, by0],
        [bx1 - c, by0],
        [bx1, by0 + c],
      );
    }
    holeC = [bx0 + R * 0.62, ym];
  }
  pts.push([-neck, neckBot], [0, neckBot]);

  const holes: P2[][] = [];
  const hasHole = o.hole !== false && bow !== "none";
  if (hasHole) holes.push(circle(holeC[0], holeC[1], R * 0.28, 32, true));

  // faces (camadas): núcleo + duas "peles" com furos que viram sulcos/cavidades reais
  const faces = o.faces ?? "grooves";
  const frontHoles: P2[][] = [...holes];
  const backHoles: P2[][] = [...holes];
  const deepest = yTop - Math.max(0, ...cuts, 0);
  const lowest = yBot + Math.max(0, ...bcuts, 0);
  const safeTop = deepest - 0.07;
  const safeBot = lowest + 0.07;
  const span = safeTop - safeBot;
  const uEnd = L - (tip === "point" ? 0.45 : rTip + 0.12);
  if (faces === "grooves") {
    frontHoles.push(slot(0.14, uEnd, safeBot + span * 0.62, Math.min(0.12, span * 0.26)));
    backHoles.push(slot(0.14, uEnd - 0.1, safeBot + span * 0.3, Math.min(0.1, span * 0.22)));
    backHoles.push(slot(0.3, uEnd - 0.3, safeBot + span * 0.78, Math.min(0.06, span * 0.14)));
  } else if (faces === "dimples") {
    const n = Math.max(4, Math.floor((uEnd - 0.2) / 0.36));
    for (let i = 0; i < n; i++) {
      const u = 0.28 + i * ((uEnd - 0.36) / (n - 1));
      const r = 0.055 + ((i * 7) % 3) * 0.018;
      frontHoles.push(circle(u, ym + (i % 2 ? 0.1 : -0.06), r, 20, true));
      backHoles.push(circle(u + 0.12, ym + (i % 2 ? -0.08 : 0.08), r * 0.9, 20, true));
    }
  } else if (faces === "track") {
    const wave = (u: number, ph: number) => ym + Math.sin(u * 3.1 + ph) * span * 0.18;
    const band = (ph: number, h: number) => {
      const p: P2[] = [];
      const u0 = 0.2;
      const u1 = uEnd;
      for (let u = u0; u <= u1; u += 0.04) p.push([u, wave(u, ph) + h / 2]);
      for (let u = u1; u >= u0; u -= 0.04) p.push([u, wave(u, ph) - h / 2]);
      return p;
    };
    frontHoles.push(band(0, Math.min(0.16, span * 0.36)));
    backHoles.push(band(1.4, Math.min(0.14, span * 0.32)));
  }

  const m = mat(o.material ?? "chrome");
  const hc = 0.058;
  const ds = 0.04;
  const b = 0.022;
  const g = new THREE.Group();
  const core = new THREE.Mesh(extrude(shapeOf(pts, holes), hc * 2, 0), m);
  const front = new THREE.Mesh(extrude(shapeOf(pts, frontHoles), ds, b), m);
  front.position.z = hc - 0.005 + ds / 2;
  const back = new THREE.Mesh(extrude(shapeOf(pts, backHoles), ds, b), m);
  back.position.z = -(hc - 0.005 + ds / 2);
  g.add(core, front, back);
  g.traverse((c) => ((c as THREE.Mesh).castShadow = true));

  return {
    group: g,
    edgeAt: (u: number) => (u < 0 || u > L ? NaN : top(u)),
    length: L,
    cutsU,
    cutDepths: cuts,
    yTop,
    center: new THREE.Vector3((L - neck - R * 2) / 2, ym, 0),
  };
}

/* ------------------------------------------------------------------------- */

function bitProfile(L: number, h: number, cuts: number[], start: number, pitch: number): P2[] {
  const pts: P2[] = [[0, 0]];
  const top = (u: number) => {
    let y = h;
    cuts.forEach((d, i) => {
      y = Math.min(y, h - d + Math.max(0, Math.abs(u - (start + i * pitch)) - 0.035) * 1.25);
    });
    const ts = L - 0.28;
    if (u > ts) y = Math.min(y, h - ((u - ts) / 0.28) * (h - 0.06));
    return y;
  };
  for (let u = 0; u <= L + 1e-6; u += 0.02) pts.push([u, Math.max(0.02, top(u))]);
  pts.push([L, 0]);
  return pts;
}

export function tetraKey(): KeyBuild {
  const L = 2.9;
  const g = new THREE.Group();
  const m = mat("chrome");
  const sets = [
    [0.12, 0.05, 0.16, 0.08, 0.14],
    [0.06, 0.15, 0.09, 0.17, 0.05],
    [0.16, 0.08, 0.04, 0.12, 0.1],
    [0.09, 0.13, 0.15, 0.04, 0.16],
  ];
  sets.forEach((cuts, k) => {
    const fin = new THREE.Mesh(extrude(shapeOf(bitProfile(L, 0.34, cuts, 0.42, 0.48)), 0.075, 0.014), m);
    const pivot = new THREE.Group();
    pivot.rotation.x = (k * Math.PI) / 2;
    pivot.add(fin);
    g.add(pivot);
  });
  const coreBar = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.14, 0.14), m);
  coreBar.position.x = (L - 0.2) / 2;
  g.add(coreBar);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 40), m);
  collar.rotation.z = Math.PI / 2;
  collar.position.x = -0.08;
  g.add(collar);
  const head = new THREE.Mesh(
    extrude(shapeOf(roundRect(-2.15, -0.82, -0.16, 0.82, 0.34), [circle(-1.62, 0, 0.27, 32, true)]), 0.26, 0.05),
    m,
  );
  g.add(head);
  return { group: g, edgeAt: () => NaN, length: L, cutsU: [], cutDepths: [], yTop: 0.34, center: new THREE.Vector3(0.4, 0, 0) };
}

export function bitKey(kind: "gorje" | "safe"): KeyBuild {
  const g = new THREE.Group();
  const safe = kind === "safe";
  const m = mat(safe ? "brassSatin" : "satin");
  const L = safe ? 3.6 : 3.2;
  const r = safe ? 0.15 : 0.13;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 32), m);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = L / 2;
  g.add(shaft);
  // anéis de acabamento
  [0.05, L - 0.06].forEach((x) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.01, 0.035, 10, 32), m);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    g.add(ring);
  });
  // paleta(s)
  const bitW = 0.5;
  const bitH = safe ? 0.62 : 0.7;
  const bit = (dir: 1 | -1, notches: number[]) => {
    const pts: P2[] = [
      [0, 0],
      [bitW, 0],
      [bitW, -bitH * dir],
    ];
    const n = notches.length;
    for (let i = 0; i < n; i++) {
      const x0 = bitW - (i * bitW) / n;
      const x1 = bitW - ((i + 1) * bitW) / n;
      const d = notches[i];
      pts.push([x0 - 0.02, -(bitH - d) * dir], [x1 + 0.02, -(bitH - d) * dir]);
    }
    pts.push([0, -bitH * dir]);
    if (dir === -1) pts.reverse();
    const mesh = new THREE.Mesh(extrude(shapeOf(pts), 0.12, 0.012), m);
    mesh.position.set(L - bitW - 0.12, -r * 0.4 * dir, 0);
    return mesh;
  };
  g.add(bit(1, [0.0, 0.22, 0.08, 0.3]));
  if (safe) g.add(bit(-1, [0.18, 0.04, 0.26, 0.1]));
  // cabeça (argola)
  const bowR = safe ? 0.9 : 0.72;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(bowR, safe ? 0.13 : 0.12, 20, 64), m);
  bow.position.x = -bowR + 0.02;
  g.add(bow);
  if (safe) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, bowR * 2, 16), m);
    bar.position.x = -bowR;
    g.add(bar);
  }
  const collar = new THREE.Mesh(new THREE.SphereGeometry(r * 1.8, 24, 16), m);
  collar.scale.set(1.3, 1, 1);
  collar.position.x = 0.02;
  g.add(collar);
  return { group: g, edgeAt: () => NaN, length: L, cutsU: [], cutDepths: [], yTop: 0, center: new THREE.Vector3(L / 2 - bowR, 0, 0) };
}

export function tubularKey(): KeyBuild {
  const g = new THREE.Group();
  const m = mat("chrome");
  const L = 1.9;
  const rOut = 0.42;
  const rIn = 0.29;
  const tubeBody = new THREE.Mesh(new THREE.CylinderGeometry(rOut, rOut, L - 0.5, 48, 1, true), m);
  tubeBody.rotation.z = Math.PI / 2;
  tubeBody.position.x = (L - 0.5) / 2;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(rIn, rIn, L, 40, 1, true), mat("darkSteel"));
  (inner.material as THREE.Material).side = THREE.BackSide;
  inner.rotation.z = Math.PI / 2;
  inner.position.x = L / 2;
  g.add(tubeBody, inner);
  // anel da ponta com entalhes em 3 profundidades
  const notchesAt = [0, 1, 2, 3, 4, 5, 6].map((i) => (i / 7) * Math.PI * 2);
  const depths = [2, 0, 1, 2, 1, 0, 2];
  const layer = (x0: number, h: number, level: number) => {
    const outer: P2[] = [];
    const n = 7;
    const notchHalf = 0.17;
    for (let i = 0; i < n; i++) {
      const a = notchesAt[i];
      const cut = depths[i] >= level;
      const segs = 10;
      for (let s = 0; s <= segs; s++) {
        const aa = a + notchHalf + (s / segs) * ((Math.PI * 2) / n - notchHalf * 2);
        outer.push([Math.cos(aa) * rOut, Math.sin(aa) * rOut]);
      }
      const an = a + (Math.PI * 2) / n;
      if (cut) {
        outer.push([Math.cos(an - notchHalf) * (rIn + 0.02), Math.sin(an - notchHalf) * (rIn + 0.02)]);
        outer.push([Math.cos(an + notchHalf) * (rIn + 0.02), Math.sin(an + notchHalf) * (rIn + 0.02)]);
      } else {
        outer.push([Math.cos(an) * rOut, Math.sin(an) * rOut]);
      }
    }
    const s = shapeOf(outer, [circle(0, 0, rIn, 40, true)]);
    const geo = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 12 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.x = x0;
    return mesh;
  };
  g.add(layer(L - 0.5, 0.18, 3), layer(L - 0.32, 0.16, 2), layer(L - 0.16, 0.16, 1));
  const nub = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), m);
  nub.position.set(L - 0.62, rOut + 0.04, 0);
  g.add(nub);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 48), m);
  neck.rotation.z = Math.PI / 2;
  g.add(neck);
  const head = new THREE.Mesh(extrude(shapeOf(circle(-1.0, 0, 0.92, 64), [circle(-1.38, 0, 0.24, 32, true)]), 0.24, 0.05), m);
  g.add(head);
  return { group: g, edgeAt: () => NaN, length: L, cutsU: [], cutDepths: [], yTop: 0, center: new THREE.Vector3(0.2, 0, 0) };
}

/** Cabeça plástica (automotiva / transponder). */
function plasticHead(kind: "auto" | "transponder") {
  const g = new THREE.Group();
  const shape = shapeOf(roundRect(-2.3, -0.78, -0.12, 0.78, 0.62), [circle(-1.9, 0, 0.17, 24, true)]);
  if (kind === "auto") {
    const head = new THREE.Mesh(extrude(shape, 0.36, 0.11, 4), mat("plastic"));
    g.add(head);
    const badge = new THREE.Mesh(extrude(shapeOf(roundRect(-1.35, -0.2, -0.65, 0.2, 0.18)), 0.02, 0.01), mat("chrome"));
    badge.position.z = 0.29;
    g.add(badge);
  } else {
    const shell = new THREE.Mesh(extrude(shape, 0.36, 0.11, 4), mat("smoke"));
    g.add(shell);
    const chip = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.42, 6, 16), mat("glow"));
    chip.rotation.z = Math.PI / 2;
    chip.position.set(-1.0, 0, 0);
    g.add(chip);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 40), mat("copper"));
    coil.position.set(-1.0, 0, 0);
    g.add(coil);
  }
  return g;
}

export function headKey(kind: "auto" | "transponder"): KeyBuild {
  const blade =
    kind === "auto"
      ? flatKey({ L: 2.8, faces: "track", tip: "round", bow: "none", yTop: 0.34, yBot: -0.34, neck: 0.12 })
      : flatKey({ L: 2.8, cuts: [0.14, 0.24, 0.08, 0.2, 0.12], faces: "grooves", bow: "none", neck: 0.12 });
  blade.group.add(plasticHead(kind));
  blade.center.set(0.3, 0, 0);
  return blade;
}

export function flipKey(): KeyBuild {
  const g = new THREE.Group();
  const body = new THREE.Mesh(extrude(shapeOf(roundRect(-3.0, -0.85, 0.15, 0.85, 0.8)), 0.48, 0.14, 4), mat("plastic"));
  g.add(body);
  const trim = new THREE.Mesh(extrude(shapeOf(roundRect(-3.04, -0.89, 0.19, 0.89, 0.82)), 0.06, 0.012), mat("chrome"));
  g.add(trim);
  // botões
  [-2.35, -1.6, -0.85].forEach((x, i) => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.08, 32), mat("rubber"));
    btn.rotation.x = Math.PI / 2;
    btn.position.set(x, 0, 0.36);
    g.add(btn);
    const glyph = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.016, 6, 24, i === 1 ? Math.PI * 1.5 : Math.PI * 2), mat("satin"));
    glyph.position.set(x, 0, 0.405);
    g.add(glyph);
  });
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.56, 40), mat("chrome"));
  pivot.rotation.x = Math.PI / 2;
  pivot.position.set(-0.05, 0, 0);
  g.add(pivot);
  const release = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 24), mat("chrome"));
  release.rotation.x = Math.PI / 2;
  release.position.set(-0.05, 0, 0.02);
  g.add(release);
  const blade = flatKey({ L: 2.7, faces: "track", tip: "round", bow: "none", yTop: 0.3, yBot: -0.3, neck: 0.1 });
  blade.group.position.x = 0.15;
  g.add(blade.group);
  return { ...blade, group: g, center: new THREE.Vector3(-0.2, 0, 0) };
}

export function padlockSet(): KeyBuild {
  const g = new THREE.Group();
  const key = flatKey({ L: 1.9, cuts: [0.12, 0.22, 0.08, 0.18], cutStart: 0.4, pitch: 0.38, bow: "round", bowR: 0.78, faces: "grooves", yTop: 0.36, yBot: -0.3 });
  key.group.position.set(0.6, -0.4, 0.9);
  key.group.rotation.set(0, -0.35, -0.18);
  g.add(key.group);
  const body = new THREE.Mesh(extrude(shapeOf(roundRect(-1.1, -1.0, 1.1, 0.9, 0.3)), 0.82, 0.12, 4), mat("brass"));
  body.position.set(-0.6, 0.1, -0.6);
  g.add(body);
  const shackleCurve = new THREE.CurvePath<THREE.Vector3>();
  shackleCurve.add(new THREE.LineCurve3(new THREE.Vector3(-0.72, 0.9, 0), new THREE.Vector3(-0.72, 1.6, 0)));
  const arc = new THREE.EllipseCurve(0, 1.6, 0.72, 0.72, Math.PI, 0, true, 0);
  const arcPts = arc.getPoints(32).map((p) => new THREE.Vector3(p.x, p.y, 0));
  shackleCurve.add(new THREE.CatmullRomCurve3(arcPts));
  shackleCurve.add(new THREE.LineCurve3(new THREE.Vector3(0.72, 1.6, 0), new THREE.Vector3(0.72, 0.9, 0)));
  const shackle = new THREE.Mesh(new THREE.TubeGeometry(shackleCurve, 80, 0.15, 20, false), mat("chrome"));
  shackle.position.set(-0.6, 0.1, -0.6);
  g.add(shackle);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 32), mat("satin"));
  face.rotation.x = Math.PI / 2;
  face.position.set(-0.6, -0.45, -0.17);
  g.add(face);
  return { ...key, group: g, center: new THREE.Vector3(-0.2, 0.3, 0) };
}

/** Constrói qualquer chave do catálogo. */
export function buildKey(model: KeyModel): KeyBuild {
  switch (model) {
    case "yale":
      return flatKey({ cuts: [0.22, 0.1, 0.3, 0.16, 0.26], faces: "grooves", bow: "round" });
    case "tetra":
      return tetraKey();
    case "gorje":
      return bitKey("gorje");
    case "dimple":
      return flatKey({ faces: "dimples", tip: "round", bow: "square", bowR: 0.9, yTop: 0.36, yBot: -0.36 });
    case "track":
      return flatKey({ faces: "track", tip: "round", bow: "hex", bowR: 0.92, yTop: 0.38, yBot: -0.38 });
    case "auto":
      return headKey("auto");
    case "flip":
      return flipKey();
    case "transponder":
      return headKey("transponder");
    case "tubular":
      return tubularKey();
    case "highsec": {
      const k = flatKey({
        faces: "dimples",
        tip: "point",
        bow: "hex",
        bowR: 0.96,
        cuts: [0.06, 0.14, 0.04, 0.12],
        bottomCuts: [0.1, 0.05, 0.13, 0.07],
        cutStart: 0.6,
        pitch: 0.55,
        yTop: 0.42,
        yBot: -0.42,
      });
      const slider = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.26), mat("brass"));
      slider.position.set(1.7, 0, 0);
      k.group.add(slider);
      const inlay = new THREE.Mesh(extrude(shapeOf(circle(-1.0, 0, 0.42, 6)), 0.3, 0.02), mat("darkSteel"));
      inlay.position.x = -0.55;
      k.group.add(inlay);
      return k;
    }
    case "padlock":
      return padlockSet();
    case "safe":
      return bitKey("safe");
  }
}

/** A chave do herói: Yale com 5 cortes que casam com os 5 pinos do cilindro. */
export const HERO_CUTS = [0.22, 0.1, 0.3, 0.16, 0.26];
export function heroKey() {
  const k = flatKey({ cuts: HERO_CUTS, faces: "grooves", bow: "round", bowR: 1.05 });
  // anel de latão em volta do furo
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05 * 0.28 + 0.03, 0.035, 12, 48), mat("brass"));
  ring.position.set(-0.3 - 1.05 * 0.92 - 1.05 * 0.42, (0.42 - 0.36) / 2, 0);
  ring.scale.z = 3.2;
  k.group.add(ring);
  return k;
}
