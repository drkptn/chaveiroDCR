"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { light } from "@/lib/light";
import { mat } from "../materials";
import { buildCylinder, CYL, KEY_PIN_LEN } from "../models/cylinder";
import { gearShape, extrude, pinGeometry, screwGroup, shavingGeometry, springGeometry } from "../models/geo";
import { heroKey } from "../models/keys";
import { StudioEnv } from "../StudioEnv";
import { heroState, smooth } from "./heroState";

type Props = { compact: boolean; active: boolean; onReady?: () => void; capture?: boolean };

export default function HeroScene({ compact, active, onReady, capture = false }: Props) {
  return (
    <Canvas
      dpr={capture ? 1 : compact ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: capture }}
      camera={{ fov: 30, position: [0, 0.3, 13.5], near: 0.1, far: 90 }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.setClearColor(0x000000, 0);
      }}
      style={{ pointerEvents: "none" }}
    >
      <StudioEnv follow={!capture} />
      <Rig compact={compact} onReady={onReady} />
    </Canvas>
  );
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Base ortonormal com eixo X = dir e normal da face (Z) ≈ dica. */
function quatFromNormal(dir: THREE.Vector3, normalHint: THREE.Vector3) {
  const x = dir.clone().normalize();
  const z = normalHint.clone().addScaledVector(x, -normalHint.dot(x)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Base ortonormal → quaternion (eixo X = dir, Y ≈ up). */
function quatFromDir(dir: THREE.Vector3, up = V(0, 1, 0), roll = 0) {
  const x = dir.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, up).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), roll));
  return q;
}

type Layout = {
  scale: number;
  cylPos: THREE.Vector3;
  cylDir: THREE.Vector3;
  keyPos: THREE.Vector3;
  keyDir: THREE.Vector3;
  keyNormal: THREE.Vector3;
  cam0: [THREE.Vector3, THREE.Vector3];
  cam1: [THREE.Vector3, THREE.Vector3];
  camDist2: number;
};

const LAYOUTS: Record<"wide" | "tall", Layout> = {
  wide: {
    scale: 1.08,
    cylPos: V(1.75, -0.75, -0.9),
    cylDir: V(1, -0.36, -0.62),
    keyPos: V(2.9, 1.72, 0.6),
    keyDir: V(-0.92, -0.38, 0.12),
    keyNormal: V(0.2, 0.35, 1),
    cam0: [V(0, 0.2, 14), V(0.25, -0.25, 0)],
    cam1: [V(-1.2, 1.1, 12.2), V(0.6, -0.7, -0.6)],
    camDist2: 15,
  },
  tall: {
    scale: 0.8,
    cylPos: V(0.95, -1.15, -0.8),
    cylDir: V(0.55, -0.62, -0.56),
    keyPos: V(0.9, 2.15, 0.9),
    keyDir: V(-0.55, -0.83, 0.1),
    keyNormal: V(0.2, 0.35, 1),
    cam0: [V(0, 0.1, 17.5), V(0, 0.2, 0)],
    cam1: [V(-1.0, 1.4, 16), V(0.3, -0.7, -0.6)],
    camDist2: 19,
  },
};

function Rig({ compact, onReady }: { compact: boolean; onReady?: () => void }) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const layout = LAYOUTS[size.width / size.height < 0.95 ? "tall" : "wide"];

  const cyl = useMemo(() => buildCylinder("glass"), []);
  const key = useMemo(() => heroKey(), []);

  const root = useRef<THREE.Group>(null);
  const cylHolder = useRef<THREE.Group>(null);
  const keyHolder = useRef<THREE.Group>(null);
  const debris = useRef<THREE.Group>(null);
  const shav = useRef<THREE.InstancedMesh>(null);

  // trilha de "motion blur" (cópias translúcidas da chave)
  const ghostMat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: "#dfe7ee", metalness: 1, roughness: 0.2, transparent: true, opacity: 0, depthWrite: false }),
    [],
  );
  const ghosts = useMemo(() => {
    return [0, 1, 2, 3].map(() => {
      const g = key.group.clone(true);
      g.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = ghostMat;
      });
      return g;
    });
  }, [key, ghostMat]);

  // detritos mecânicos flutuando em profundidades diferentes
  const parts = useMemo(() => {
    const list: { obj: THREE.Object3D; base: THREE.Vector3; spin: THREE.Vector3; drift: THREE.Vector3; phase: number }[] = [];
    const add = (obj: THREE.Object3D, base: THREE.Vector3, s = 1) => {
      obj.scale.setScalar(s);
      list.push({
        obj,
        base,
        spin: V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6),
        drift: base.clone().normalize().multiplyScalar(3 + Math.random() * 3),
        phase: Math.random() * Math.PI * 2,
      });
    };
    const screw = () => screwGroup(mat("chrome"), mat("darkSteel"));
    add(screw(), V(-4.6, 2.3, -2.5), 0.9);
    add(screw(), V(4.8, 2.6, -4.2), 0.8);
    add(new THREE.Mesh(pinGeometry(0.42, 0.1, true), mat("brass")), V(-3.4, -1.8, 1.2), 1.4);
    add(new THREE.Mesh(pinGeometry(0.36, 0.1, true), mat("brass")), V(3.6, 1.6, 1.8), 1.3);
    add(new THREE.Mesh(pinGeometry(0.42, 0.1, false), mat("chrome")), V(-1.6, -2.6, -1.4), 1.3);
    const sp = new THREE.Mesh(springGeometry(0.09, 0.016, 8), mat("satin"));
    sp.scale.y = 0.9;
    add(sp, V(5.4, -1.2, -1.6), 1.4);
    add(new THREE.Mesh(extrude(gearShape(16, 0.62, 0.16, 0.16, 5), 0.16, 0.02), mat("brushed")), V(-5.4, -0.4, -3.6), 1.1);
    if (!compact) {
      add(new THREE.Mesh(extrude(gearShape(10, 0.38, 0.14, 0.1, 0), 0.12, 0.015), mat("brass")), V(2.6, 3.2, -2.2), 1);
      add(new THREE.Mesh(pinGeometry(0.3, 0.1, true), mat("brass")), V(0.4, 3.1, 2.4), 1.1);
    }
    return list;
  }, [compact]);

  const shavingCount = compact ? 16 : 34;
  const shavings = useMemo(() => {
    return Array.from({ length: shavingCount }, () => ({
      p: V((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 7 - 1),
      r: V(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      s: 0.22 + Math.random() * 0.32,
      v: 0.05 + Math.random() * 0.12,
    }));
  }, [shavingCount]);
  const shavGeo = useMemo(() => shavingGeometry(), []);

  // reutilizáveis
  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      m2: new THREE.Matrix4(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      p: new THREE.Vector3(),
      p2: new THREE.Vector3(),
      s: new THREE.Vector3(),
      look: new THREE.Vector3(),
      camPos: new THREE.Vector3(),
      o: new THREE.Object3D(),
      flip: new THREE.Matrix4().makeRotationX(Math.PI),
      history: [] as { p: THREE.Vector3; q: THREE.Quaternion }[],
      clock: 0,
      frames: 0,
      intro: 0,
    }),
    [],
  );

  useEffect(() => {
    tmp.history.length = 0;
  }, [tmp]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const frozen = heroState.frozen;
    tmp.clock = frozen ? heroState.t : tmp.clock + dt;
    const t = tmp.clock;
    heroState.ps += (heroState.p - heroState.ps) * (frozen ? 1 : Math.min(1, dt * 7));
    const p = heroState.ps;

    // entrada (uma vez): a chave chega com rastro de movimento
    tmp.intro = frozen ? 1 : Math.min(1, tmp.intro + dt / 1.7);
    const intro = 1 - Math.pow(1 - tmp.intro, 4);

    const L = layout;
    if (root.current) root.current.scale.setScalar(L.scale);

    // ---------- fases ----------
    const align = smooth(0.02, 0.2, p);
    const insert = smooth(0.18, 0.52, p);
    const turn = smooth(0.55, 0.7, p) * (Math.PI / 2);
    const portal = smooth(0.66, 0.86, p);
    const scatter = smooth(0, 0.5, p);

    // ---------- cilindro ----------
    const cylQ = quatFromDir(L.cylDir);
    if (cylHolder.current) {
      const bob = frozen ? 0 : Math.sin(t * 0.6) * 0.06 * (1 - align);
      cylHolder.current.position.copy(L.cylPos).add(tmp.p.set(0, bob, 0));
      cylHolder.current.quaternion.copy(cylQ);
      // leve resposta à lanterna quando ocioso
      const tilt = (1 - align) * 0.08;
      cylHolder.current.rotateY(light.x * tilt);
      cylHolder.current.rotateZ(light.y * tilt * 0.6);
    }

    const shoulder = THREE.MathUtils.lerp(-4.6, CYL.seat, insert);
    cyl.update(key, align > 0.98 ? shoulder : -10, turn, frozen ? 0 : dt);
    cyl.shearMat.opacity = smooth(0.57, 0.68, p) * 0.9;
    heroState.insert = insert;
    heroState.turn = turn;
    cyl.pinTop.forEach((top, i) => (heroState.gaps[i] = top - KEY_PIN_LEN[i] - CYL.shear));

    // ---------- chave ----------
    if (keyHolder.current && cylHolder.current) {
      // pose alinhada = cilindro · giro · deslocamento · segredo para baixo
      cylHolder.current.updateMatrix();
      tmp.m.copy(cylHolder.current.matrix);
      tmp.m.multiply(tmp.m2.makeRotationX(turn));
      tmp.m.multiply(tmp.m2.makeTranslation(shoulder, 0, 0));
      tmp.m.multiply(tmp.flip);
      tmp.m.decompose(tmp.p2, tmp.q2, tmp.s);

      // pose ociosa (diagonal, segredo para cima, flutuando)
      const idleQ = quatFromNormal(L.keyDir, L.keyNormal);
      const sway = frozen ? 0 : 1;
      idleQ.multiply(tmp.q.setFromEuler(new THREE.Euler(Math.sin(t * 0.5) * 0.12 * sway + light.y * 0.12, light.x * 0.18, Math.sin(t * 0.37) * 0.05 * sway)));
      // giro de entrada em torno da própria lâmina
      idleQ.multiply(tmp.q.setFromAxisAngle(V(1, 0, 0), (1 - intro) * Math.PI * 1.6));
      const idleP = tmp.p.copy(L.keyPos).add(V(0, Math.sin(t * 0.8) * 0.12 * sway, 0));
      idleP.add(V(9 * (1 - intro), 3.2 * (1 - intro), -3 * (1 - intro)));

      keyHolder.current.position.lerpVectors(idleP, tmp.p2, align);
      keyHolder.current.quaternion.slerpQuaternions(idleQ, tmp.q2, align);

      // rastro
      const h = tmp.history;
      h.unshift({ p: keyHolder.current.position.clone(), q: keyHolder.current.quaternion.clone() });
      if (h.length > 12) h.pop();
      const speed = h.length > 2 ? h[0].p.distanceTo(h[2].p) : 0;
      ghostMat.opacity = Math.min(0.32, speed * 0.55);
      ghosts.forEach((g, i) => {
        const e = h[Math.min(h.length - 1, (i + 1) * 2)];
        if (!e) return;
        g.position.copy(e.p);
        g.quaternion.copy(e.q);
        g.visible = ghostMat.opacity > 0.01;
      });
    }

    // ---------- detritos e limalha ----------
    parts.forEach((d) => {
      const o = d.obj;
      o.position.copy(d.base).addScaledVector(d.drift, scatter);
      o.position.y += frozen ? 0 : Math.sin(t * 0.7 + d.phase) * 0.18;
      o.position.x += light.x * 0.25 * (d.base.z + 4) * 0.12;
      o.rotation.x = d.phase + t * d.spin.x;
      o.rotation.y = d.phase * 0.5 + t * d.spin.y;
      o.rotation.z = t * d.spin.z;
    });
    if (debris.current) debris.current.visible = scatter < 0.98;

    if (shav.current) {
      shavings.forEach((s, i) => {
        tmp.o.position.copy(s.p);
        tmp.o.position.y += ((t * s.v + i) % 8) - 4 + scatter * 2;
        tmp.o.rotation.set(s.r.x + t * 0.4, s.r.y + t * 0.3, s.r.z);
        tmp.o.scale.setScalar(s.s * (1 - scatter * 0.6));
        tmp.o.updateMatrix();
        shav.current!.setMatrixAt(i, tmp.o.matrix);
      });
      shav.current.instanceMatrix.needsUpdate = true;
    }

    // ---------- câmera ----------
    const camAspect = size.width / size.height;
    const [c0p, c0t] = L.cam0;
    const [c1p, c1t] = L.cam1;
    const k1 = smooth(0.04, 0.4, p);
    tmp.camPos.lerpVectors(c0p, c1p, k1);
    tmp.look.lerpVectors(c0t, c1t, k1);
    if (portal > 0 && cylHolder.current && root.current) {
      // de frente para a face do cilindro (o "buraco da fechadura")
      const face = cylHolder.current.position.clone().multiplyScalar(L.scale);
      const axis = V(1, 0, 0).applyQuaternion(cylHolder.current.quaternion).normalize();
      const fit = camAspect < 0.95 ? 1.25 : 1;
      const front = face.clone().addScaledVector(axis, -L.camDist2 * fit);
      tmp.camPos.lerp(front, portal);
      tmp.look.lerp(face, portal);
    }
    // parallax da lanterna
    tmp.camPos.x += light.x * 0.35 * (1 - portal);
    tmp.camPos.y += light.y * 0.2 * (1 - portal);
    cam.position.copy(tmp.camPos);
    cam.lookAt(tmp.look);

    // projeta a face do cilindro (centro + raio) para o portal do DOM
    if (cylHolder.current) {
      cam.updateMatrixWorld();
      const c = cylHolder.current.position.clone().multiplyScalar(L.scale);
      const edge = c.clone().add(V(0, CYL.rBody * L.scale, 0).applyQuaternion(cam.quaternion));
      c.project(cam);
      edge.project(cam);
      heroState.faceX = (c.x * 0.5 + 0.5) * size.width;
      heroState.faceY = (-c.y * 0.5 + 0.5) * size.height;
      heroState.faceR = Math.abs((edge.y - c.y) * 0.5 * size.height);
    }

    tmp.frames++;
    if (tmp.frames === 3) onReady?.();
  });

  return (
    <group ref={root}>
      <group ref={cylHolder}>
        <primitive object={cyl.root} />
      </group>
      <group ref={keyHolder}>
        <primitive object={key.group} />
      </group>
      {ghosts.map((g, i) => (
        <primitive key={i} object={g} />
      ))}
      <group ref={debris}>
        {parts.map((d, i) => (
          <primitive key={i} object={d.obj} />
        ))}
      </group>
      <instancedMesh ref={shav} args={[shavGeo, mat("brass"), shavingCount]} frustumCulled={false} />
    </group>
  );
}
