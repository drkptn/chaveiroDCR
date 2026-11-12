"use client";

/**
 * ESTÚDIO DE RENDERS (somente com STUDIO=1 — não vai para o site publicado).
 * Fotografa os modelos procedurais para gerar imagens leves (WebP) usadas nos
 * cards de serviço (giro 360° por sprite), no poster do hero, no OG e na galeria.
 */
import { Canvas, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { StudioEnv } from "@/three/StudioEnv";
import { buildCylinder, CYL } from "@/three/models/cylinder";
import { digitalLock, emblem, keyFan, mortiseLock } from "@/three/models/extra";
import { buildKey, flipKey, heroKey } from "@/three/models/keys";
import { pinGeometry, screwGroup, springGeometry } from "@/three/models/geo";
import { mat } from "@/three/materials";
import { heroState } from "@/three/scenes/heroState";
import { SYMBOL_PATH } from "@/components/brand/logoPaths";

const HeroScene = dynamic(() => import("@/three/scenes/HeroScene"), { ssr: false });

type Shot = { build: () => THREE.Object3D; tilt?: [number, number, number]; fit?: number; turn?: boolean };

function cylinderWithKey(insert = 1) {
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

const SHOTS: Record<string, Shot> = {
  copias: { build: keyFan, tilt: [0.35, 0, 0], fit: 0.82 },
  automotivas: { build: () => flipKey().group, tilt: [0.5, 0, 0.1], fit: 0.84 },
  fechaduras: { build: () => cylinderWithKey(0.55), tilt: [0.3, 0, 0], fit: 0.86 },
  abertura: { build: mortiseLock, tilt: [0.25, 0, 0], fit: 0.86 },
  seguranca: { build: digitalLock, tilt: [0.15, 0, 0], fit: 0.88 },
  emblema: { build: () => emblem(), tilt: [0, 0, 0], fit: 0.95 },
  pin: { build: () => new THREE.Mesh(pinGeometry(0.42, 0.1, true), mat("brass")), tilt: [0.4, 0, 0.5], fit: 1.4, turn: false },
  spring: { build: () => new THREE.Mesh(springGeometry(0.09, 0.016, 8), mat("satin")), tilt: [0.3, 0, 0.4], fit: 1.3, turn: false },
  screw: { build: () => screwGroup(mat("chrome"), mat("darkSteel")), tilt: [0.5, 0, 0.6], fit: 1.3, turn: false },
  // ilustrações da galeria (poses fixas)
  "gal-cilindro": { build: () => cylinderWithKey(1), tilt: [0.35, -0.7, 0], fit: 0.92, turn: false },
  "gal-tetra": { build: () => buildKey("tetra").group, tilt: [0.7, -0.4, 0.35], fit: 0.95, turn: false },
  "gal-gorje": { build: () => buildKey("gorje").group, tilt: [0.4, 0.3, -0.3], fit: 0.95, turn: false },
  "gal-embutir": { build: mortiseLock, tilt: [0.2, -0.6, 0], fit: 0.95, turn: false },
  "gal-digital": { build: digitalLock, tilt: [0.1, 0.55, 0], fit: 0.95, turn: false },
  "gal-chaves": { build: keyFan, tilt: [0.5, 0.4, 0], fit: 0.9, turn: false },
};

function Subject({ name, frame, frames, nonce }: { name: string; frame: number; frames: number; nonce: number }) {
  const shot = SHOTS[name];
  const obj = useMemo(() => {
    const o = shot.build();
    const box = new THREE.Box3().setFromObject(o);
    const c = box.getCenter(new THREE.Vector3());
    o.position.sub(c);
    const wrap = new THREE.Group();
    wrap.add(o);
    return wrap;
  }, [shot]);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const angle = shot.turn === false ? 0 : (frame / frames) * Math.PI * 2;
    obj.rotation.set(0, 0, 0);
    obj.rotateX(shot.tilt?.[0] ?? 0);
    obj.rotateY(angle + (shot.tilt?.[1] ?? 0));
    obj.rotateZ(shot.tilt?.[2] ?? 0);
    // enquadra pela esfera envolvente (estável durante o giro)
    const sphere = new THREE.Box3().setFromObject(obj.children[0]).getBoundingSphere(new THREE.Sphere());
    const cam = camera as THREE.PerspectiveCamera;
    const dist = (sphere.radius * (shot.fit ?? 1)) / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    let n = 0;
    const tick = () => {
      invalidate();
      if (++n < 5) requestAnimationFrame(tick);
      else requestAnimationFrame(() => ((window as unknown as { __rendered: number }).__rendered = frame));
    };
    requestAnimationFrame(tick);
  }, [frame, frames, nonce, obj, shot, camera, invalidate]);

  return <primitive object={obj} />;
}

export default function Estudio() {
  const [q, setQ] = useState<URLSearchParams | null>(null);
  const [shotState, setShot] = useState({ i: 0, k: 0 });
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQ(params);
    (window as unknown as { __frame: (i: number) => void }).__frame = (i: number) => setShot({ i, k: Math.random() });
    heroState.frozen = true;
    heroState.p = 0;
    heroState.ps = 0;
  }, []);
  if (!q) return null;
  const obj = q.get("obj") ?? "copias";
  const w = parseInt(q.get("w") ?? q.get("size") ?? "512");
  const h = parseInt(q.get("h") ?? q.get("size") ?? "512");
  const frames = parseInt(q.get("frames") ?? "24");
  const bg = q.get("bg");

  if (obj === "hero" || obj === "og") {
    return (
      <div
        id="stage"
        style={{
          width: w,
          height: h,
          position: "relative",
          overflow: "hidden",
          background: obj === "og" ? "radial-gradient(90% 90% at 70% 40%, #14202e 0%, #090c11 70%)" : "transparent",
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <HeroScene compact={false} active capture onReady={() => setTimeout(() => ((window as unknown as { __rendered: number }).__rendered = 0), 400)} />
        </div>
        {obj === "og" && (
          <div style={{ position: "absolute", left: 64, bottom: 64, color: "#e6ebf0" }}>
            <svg viewBox="0 0 64 64" width="84" height="84" style={{ marginBottom: 18 }}>
              <defs>
                <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" />
                  <stop offset="0.48" stopColor="#a7b1bc" />
                  <stop offset="0.52" stopColor="#3a434d" />
                  <stop offset="1" stopColor="#dce3e9" />
                </linearGradient>
              </defs>
              <path d={SYMBOL_PATH} fill="url(#og)" fillRule="evenodd" />
            </svg>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", letterSpacing: "0.3em", fontSize: 18, color: "#79e9ff" }}>CHAVEIRO</div>
            <div style={{ fontFamily: "Archivo Variable", fontStretch: "125%", fontWeight: 800, fontSize: 92, lineHeight: 0.9 }}>DCR</div>
            <div style={{ fontFamily: "Archivo Variable", fontSize: 26, marginTop: 14, color: "#a7b1bc" }}>Chaves, fechaduras e soluções de segurança</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      id="stage"
      style={{
        width: w,
        height: h,
        background: bg ? `radial-gradient(80% 80% at 50% 35%, #1a2532 0%, #0b1017 62%, #07090d 100%)` : "transparent",
      }}
    >
      <Canvas
        dpr={1}
        frameloop="demand"
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ fov: 26, position: [0, 0, 10] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
          gl.setClearColor(0x000000, 0);
        }}
      >
        <StudioEnv follow={false} frames={1} />
        <Subject name={obj} frame={shotState.i} nonce={shotState.k} frames={frames} />
      </Canvas>
    </div>
  );
}
