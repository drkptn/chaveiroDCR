"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { light } from "@/lib/light";

/**
 * Estúdio de fotografia virtual: faixas de luz (softboxes) que desenham
 * os reflexos no cromo. Uma das luzes é a "lanterna" — segue o cursor,
 * então o reflexo desliza pela peça de verdade (não é um brilho em CSS).
 */
export function StudioEnv({ follow = true, frames = Infinity, warm = 0.6 }: { follow?: boolean; frames?: number; warm?: number }) {
  const lamp = useRef<THREE.Mesh>(null);
  const strip = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!follow || !lamp.current) return;
    lamp.current.position.x += (light.x * 7 - lamp.current.position.x) * 0.12;
    lamp.current.position.y += (light.y * 4.5 - lamp.current.position.y) * 0.12;
    if (strip.current) strip.current.position.x = -6 + light.x * 1.5;
  });

  return (
    <Environment resolution={256} frames={frames} background={false}>
      <color attach="background" args={["#0b121b"]} />
      {/* teto: softbox grande — desenha o "céu" claro no cromo */}
      <Lightformer form="rect" intensity={2.4} color="#eef5fb" scale={[18, 5, 1]} position={[0, 6, 0]} rotation-x={Math.PI / 2} />
      {/* faixa lateral esquerda — risco vertical clássico do cromo */}
      <Lightformer ref={strip} form="rect" intensity={3.2} color="#ffffff" scale={[1.3, 14, 1]} position={[-6, 0, 3]} rotation-y={Math.PI / 2.4} />
      {/* painel frio à direita */}
      <Lightformer form="rect" intensity={1.1} color="#a9cbe8" scale={[7, 12, 1]} position={[8, 0, 1]} rotation-y={-Math.PI / 2} />
      {/* contraluz ciano */}
      <Lightformer form="rect" intensity={2} color="#5fe3ff" scale={[0.45, 12, 1]} position={[6, 0.5, -4]} rotation-y={-Math.PI / 3} />
      {/* rebatedor quente (latão) no chão */}
      <Lightformer form="rect" intensity={warm} color="#e2bd78" scale={[14, 3, 1]} position={[0, -6, 1]} rotation-x={-Math.PI / 2} />
      {/* fundo azul-meia-noite */}
      <Lightformer form="rect" intensity={0.7} color="#3978a8" scale={[26, 10, 1]} position={[0, 0, -10]} />
      {/* frente: rebatedor suave (atrás da câmera) */}
      <Lightformer form="rect" intensity={1.5} color="#e3ecf4" scale={[34, 7, 1]} position={[0, 4.6, 12]} rotation-y={Math.PI} />
      <Lightformer form="rect" intensity={0.25} color="#8fa4b8" scale={[34, 5, 1]} position={[0, -3.5, 12]} rotation-y={Math.PI} />
      {/* a lanterna */}
      <Lightformer ref={lamp} form="circle" intensity={4} color="#ffffff" scale={3} position={[3, 2, 7]} />
    </Environment>
  );
}
