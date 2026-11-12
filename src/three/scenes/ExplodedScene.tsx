"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { cylinderParts, type CylinderPartId } from "@/config/content";
import { buildCylinder, CYL } from "../models/cylinder";
import { heroKey } from "../models/keys";
import { StudioEnv } from "../StudioEnv";
import { smooth } from "./heroState";
import { explodedState } from "./sceneState";

export { explodedState };

type Props = { active: boolean; compact: boolean };

export default function ExplodedScene({ active, compact }: Props) {
  return (
    <Canvas
      dpr={compact ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 28, position: [0, 0, 22], near: 0.1, far: 100 }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.setClearColor(0x000000, 0);
      }}
      style={{ pointerEvents: "none" }}
    >
      <StudioEnv warm={0.9} />
      <Exploded compact={compact} />
    </Canvas>
  );
}

type Tracked = { obj: THREE.Object3D; mats: THREE.Material[]; lines: THREE.LineBasicMaterial[] };

function Exploded({ compact }: { compact: boolean }) {
  const { camera, size } = useThree();
  const cyl = useMemo(() => buildCylinder("solid"), []);
  const key = useMemo(() => heroKey(), []);
  const rig = useRef<THREE.Group>(null);
  const keyHolder = useRef<THREE.Group>(null);

  // materiais individuais por peça (para destacar/esmaecer) + arestas de raio-x
  const groups = useMemo(() => {
    const map = new Map<CylinderPartId, Tracked[]>();
    const track = (id: CylinderPartId, objs: THREE.Object3D[]) => {
      const list: Tracked[] = [];
      objs.forEach((obj) => {
        const mats: THREE.Material[] = [];
        const lines: THREE.LineBasicMaterial[] = [];
        obj.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            // idempotente (o StrictMode executa o useMemo duas vezes)
            if (!mesh.userData.own) {
              const m = (mesh.material as THREE.Material).clone();
              m.transparent = true;
              mesh.material = m;
              mesh.userData.own = true;
            }
            mats.push(mesh.material as THREE.Material);
            if (!mesh.children.some((c) => (c as THREE.LineSegments).isLineSegments)) {
              const lm = new THREE.LineBasicMaterial({ color: "#8fe8ff", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
              const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), lm);
              l.userData.own = true;
              mesh.add(l);
            }
          }
          const ls = o as THREE.LineSegments;
          if (ls.isLineSegments) {
            if (!ls.userData.own) {
              const lm = (ls.material as THREE.LineBasicMaterial).clone();
              lm.opacity = 0;
              ls.material = lm;
              ls.userData.own = true;
            }
            lines.push(ls.material as THREE.LineBasicMaterial);
          }
        });
        list.push({ obj, mats, lines });
      });
      map.set(id, list);
    };
    (Object.keys(cyl.parts) as (keyof typeof cyl.parts)[]).forEach((k) => track(k, cyl.parts[k]));
    track("key", [key.group]);
    return map;
  }, [cyl, key]);

  const tmp = useMemo(() => ({ v: new THREE.Vector3(), t: 0, look: new THREE.Vector3() }), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    tmp.t += dt;
    const p = explodedState.p;
    const explode = smooth(0.06, 0.3, p) * (1 - smooth(0.9, 0.99, p));
    const e = explode;

    // a chave começa inserida e sai junto com o rotor
    const keyOut = e;
    cyl.update(key, CYL.seat, 0, 0);
    cyl.plug.position.set(-3.1 * e, 1.75 * e, 0);
    cyl.cam.position.x = 1.4 * e;
    cyl.driverPins.forEach((d) => (d.position.y += -2.5 * e));
    cyl.springs.forEach((s) => (s.position.y = CYL.chamberBottom - 3.9 * e));
    if (keyHolder.current) {
      keyHolder.current.position.set(CYL.seat - 3.1 * e - 3.2 * keyOut, 1.75 * e, 0);
      keyHolder.current.rotation.set(Math.PI, 0, 0);
    }

    // destaque: peça em foco nítida, demais em raio-x
    const focus = explodedState.focus;
    const ids = cylinderParts.map((c) => c.id);
    ids.forEach((id, i) => {
      const list = groups.get(id);
      if (!list) return;
      const on = focus < 0 || focus === i;
      const targetOpacity = on ? 1 : 0.07;
      const targetLine = focus >= 0 && !on ? 0.35 : explodedState.xray ? 0.5 : 0;
      list.forEach((tr) => {
        tr.mats.forEach((m) => {
          m.opacity += (targetOpacity - m.opacity) * Math.min(1, dt * 6);
          m.depthWrite = m.opacity > 0.6;
        });
        tr.lines.forEach((l) => (l.opacity += (targetLine - l.opacity) * Math.min(1, dt * 6)));
      });
    });
    const shearOn = focus === ids.indexOf("shear");
    cyl.shearMat.opacity += ((shearOn ? 1 : 0.0) - cyl.shearMat.opacity) * Math.min(1, dt * 5);

    // giro lento de apresentação
    if (rig.current) {
      const aspect = size.width / size.height;
      const tall = aspect < 0.95;
      rig.current.rotation.y = (tall ? -0.95 : -0.5) + Math.sin(tmp.t * 0.25) * 0.08 + (1 - e) * 0.2;
      rig.current.rotation.x = tall ? 0.3 : 0.22;
      rig.current.position.set(tall ? -0.4 + 0.6 * e : 1.6, tall ? 2.6 : 1.0, 0);
      const s = tall ? 0.9 : 1;
      rig.current.scale.setScalar(s);
    }

    // câmera
    const aspect = size.width / size.height;
    const dist = aspect < 0.95 ? 40 : compact ? 25 : 23;
    camera.position.set(-1.2, 1.2, dist);
    tmp.look.set(-1.2, -0.6, 0);
    camera.lookAt(tmp.look);

    // âncoras das cotas (projetadas para a tela)
    explodedState.w = size.width;
    explodedState.h = size.height;
    const anchorOf = (id: CylinderPartId): THREE.Object3D | null => {
      switch (id) {
        case "body":
          return cyl.housing;
        case "plug":
          return cyl.parts.plug[0];
        case "keyPins":
          return cyl.keyPins[2];
        case "driverPins":
          return cyl.driverPins[3];
        case "springs":
          return cyl.springs[1];
        case "shear":
          return cyl.shearLine;
        case "cam":
          return cyl.parts.cam[0];
        case "key":
          return key.group;
      }
    };
    const offsets: Record<CylinderPartId, [number, number, number]> = {
      body: [0, 0.7, 0.5],
      plug: [0, 0.3, 0.5],
      keyPins: [0, 0.2, 0],
      driverPins: [0, 0.2, 0],
      springs: [0, 0.5, 0],
      shear: [0.4, 0, 0.5],
      cam: [0, -0.4, 0],
      key: [-1.6, 0, 0],
    };
    ids.forEach((id, i) => {
      const o = anchorOf(id);
      if (!o) return;
      o.updateWorldMatrix(true, false);
      tmp.v.set(...offsets[id]);
      o.localToWorld(tmp.v);
      tmp.v.project(camera);
      const a = explodedState.anchors[i];
      a.x = (tmp.v.x * 0.5 + 0.5) * size.width;
      a.y = (-tmp.v.y * 0.5 + 0.5) * size.height;
      a.z = tmp.v.z;
    });
  });

  return (
    <group ref={rig}>
      <primitive object={cyl.root} />
      <group ref={keyHolder}>
        <primitive object={key.group} />
      </group>
    </group>
  );
}
