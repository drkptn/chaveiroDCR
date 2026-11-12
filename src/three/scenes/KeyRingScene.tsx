"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { keyTypes } from "@/config/keys";
import { mat } from "../materials";
import { buildKey } from "../models/keys";
import { StudioEnv } from "../StudioEnv";
import { ringState } from "./sceneState";

export { ringState };

type Props = { active: boolean; compact: boolean };

export default function KeyRingScene({ active, compact }: Props) {
  return (
    <Canvas
      dpr={compact ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 30, position: [0, 0, 20], near: 0.1, far: 100 }}
      frameloop={active ? "always" : "never"}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.06;
        gl.setClearColor(0x000000, 0);
      }}
      style={{ pointerEvents: "none" }}
    >
      <StudioEnv />
      <Ring />
    </Canvas>
  );
}

const N = keyTypes.length;
const STEP = (Math.PI * 2) / N;

function Ring() {
  const { size, camera } = useThree();
  const ring = useRef<THREE.Group>(null);
  const holders = useRef<(THREE.Group | null)[]>([]);
  const spinners = useRef<(THREE.Group | null)[]>([]);

  const keys = useMemo(
    () =>
      keyTypes.map((k) => {
        const b = buildKey(k.id);
        // materiais próprios para poder "apagar" as chaves não selecionadas
        const mats: THREE.MeshPhysicalMaterial[] = [];
        b.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            const c = (m.material as THREE.MeshPhysicalMaterial).clone();
            c.userData.baseEnv = c.envMapIntensity ?? 1;
            c.userData.baseColor = c.color.clone();
            m.material = c;
            mats.push(c);
          }
        });
        // centraliza a peça na própria lâmina (para o giro de 360°)
        b.group.position.sub(b.center);
        return { build: b, mats };
      }),
    [],
  );

  const ringGeo = useMemo(() => new THREE.TorusGeometry(4.2, 0.11, 18, 160, Math.PI * 1.94), []);
  const tmp = useMemo(() => ({ angle: 0, vel: 0, t: 0, dim: keyTypes.map(() => 1) }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    tmp.t += dt;
    const tall = size.width / size.height < 0.95;

    // rotação alvo: chave selecionada aponta para a direita (ângulo 0)
    const target = -ringState.selected * STEP + ringState.drag;
    // mola com inércia
    const k = ringState.dragging ? 60 : 26;
    tmp.vel += ((target - tmp.angle) * k - tmp.vel * 9) * dt;
    tmp.angle += tmp.vel * dt;

    if (ring.current) {
      ring.current.rotation.z = tmp.angle;
      const aspect = size.width / size.height;
      ring.current.position.set(tall ? -3.6 : aspect > 1.4 ? -9.8 : -6.6, tall ? 3.4 : 0, 0);
      ring.current.rotation.x = Math.sin(tmp.t * 0.3) * 0.05;
      ring.current.rotation.y = tall ? 0.18 : 0.32;
    }

    keys.forEach((k, i) => {
      const h = holders.current[i];
      const s = spinners.current[i];
      if (!h || !s) return;
      // ângulo atual desta chave no mundo
      let rel = (i * STEP + tmp.angle) % (Math.PI * 2);
      if (rel > Math.PI) rel -= Math.PI * 2;
      if (rel < -Math.PI) rel += Math.PI * 2;
      const isSel = i === ringState.selected;
      const near = Math.max(0, 1 - Math.abs(rel) / (STEP * 0.9));
      const out = (isSel ? 1 : 0) * near;
      h.position.set(4.2 + 2.9 + out * 1.6, 0, 0);
      h.scale.setScalar(0.78 + out * 0.42);
      // a selecionada gira 360° em torno da lâmina
      s.rotation.x = isSel ? tmp.t * 0.9 : Math.sin(tmp.t * 0.6 + i) * 0.25;
      s.rotation.y = isSel ? Math.sin(tmp.t * 0.5) * 0.2 : 0;
      // brilho
      const lit = isSel ? 1 : 0.18 + near * 0.2;
      tmp.dim[i] += (lit - tmp.dim[i]) * Math.min(1, dt * 5);
      k.mats.forEach((m) => {
        m.envMapIntensity = (m.userData.baseEnv as number) * tmp.dim[i];
        m.color.copy(m.userData.baseColor as THREE.Color).multiplyScalar(0.35 + 0.65 * tmp.dim[i]);
      });
    });

    camera.position.set(tall ? 0 : 0, tall ? 0.5 : 0, tall ? 26 : 20);
    camera.lookAt(tall ? 0 : 0, tall ? 0.5 : 0, 0);
  });

  return (
    <group ref={ring}>
      {/* argola dupla (chaveiro) */}
      <mesh geometry={ringGeo} material={mat("chrome")} />
      <mesh geometry={ringGeo} material={mat("chrome")} position={[0, 0, 0.24]} rotation={[0, 0, 0.3]} />
      {keys.map((k, i) => (
        <group key={keyTypes[i].id} rotation={[0, 0, i * STEP]}>
          <group ref={(el) => void (holders.current[i] = el)}>
            <group ref={(el) => void (spinners.current[i] = el)}>
              <primitive object={k.build.group} />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
