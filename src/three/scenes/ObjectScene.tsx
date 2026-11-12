"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SERVICE_MODELS } from "../models/extra";
import { AdaptiveQuality } from "../Quality";
import { StudioEnv } from "../StudioEnv";

/** Controle compartilhado com o DOM (arraste com inércia). */
export type SpinControl = { vel: number; dragging: boolean; push: number; auto: number };

type Props = { name: string; active: boolean; ctl: SpinControl; onReady?: () => void };

/**
 * Vitrine 3D ao vivo das gavetas de serviço: o objeto gira a 60 fps
 * (substitui a folha de 24 fotos, que girava "quadrado").
 */
export default function ObjectScene({ name, active, ctl, onReady }: Props) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 26, position: [0, 0, 10], near: 0.1, far: 100 }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.1;
        gl.setClearColor(0x000000, 0);
      }}
      style={{ pointerEvents: "none" }}
    >
      <StudioEnv />
      <AdaptiveQuality max={1.5} active={active} />
      <Spinner name={name} ctl={ctl} onReady={onReady} />
    </Canvas>
  );
}

function Spinner({ name, ctl, onReady }: { name: string; ctl: SpinControl; onReady?: () => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const spin = useRef<THREE.Group>(null);
  const frames = useRef(0);
  const angle = useRef(0);

  const { obj, dist, tilt } = useMemo(() => {
    const m = SERVICE_MODELS[name] ?? SERVICE_MODELS.copias;
    const o = m.build();
    const box = new THREE.Box3().setFromObject(o);
    o.position.sub(box.getCenter(new THREE.Vector3()));
    // raio estável durante o giro (esfera envolvente)
    const r = new THREE.Box3().setFromObject(o).getBoundingSphere(new THREE.Sphere()).radius;
    const d = (r * m.fit) / Math.sin(THREE.MathUtils.degToRad(13));
    return { obj: o, dist: d, tilt: m.tilt };
  }, [name]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    if (!ctl.dragging) {
      // inércia do arraste volta suavemente ao giro automático
      ctl.vel += (ctl.auto - ctl.vel) * Math.min(1, dt * 1.6);
      angle.current += ctl.vel * dt;
    } else {
      angle.current += ctl.push;
      ctl.vel = ctl.push / Math.max(dt, 1 / 120);
      ctl.push = 0;
    }
    if (spin.current) spin.current.rotation.y = angle.current;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    if (++frames.current === 3) onReady?.();
  });

  return (
    <group rotation={[tilt[0], 0, 0]}>
      <group ref={spin}>
        <group rotation={[0, tilt[1], tilt[2]]}>
          <primitive object={obj} />
        </group>
      </group>
    </group>
  );
}
