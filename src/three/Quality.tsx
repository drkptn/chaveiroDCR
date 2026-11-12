"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";

/**
 * Qualidade adaptativa: mede o FPS real e baixa/sobe a resolução do canvas
 * para manter a animação fluida em qualquer aparelho.
 */
export function AdaptiveQuality({ max = 1.5, min = 0.6, active = true }: { max?: number; min?: number; active?: boolean }) {
  const setDpr = useThree((s) => s.setDpr);
  const [dpr, set] = useState(() => Math.min(max, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  useEffect(() => setDpr(dpr), [dpr, setDpr]);
  // só mede com a cena rodando (uma pausa fora da tela não é lentidão)
  if (!active) return null;
  return (
    <PerformanceMonitor
      ms={250}
      iterations={6}
      bounds={(refresh) => (refresh > 90 ? [55, 85] : [48, 58])}
      flipflops={4}
      onDecline={() => set((d) => Math.max(min, +(d - 0.25).toFixed(2)))}
      onIncline={() => set((d) => Math.min(max, +(d + 0.25).toFixed(2)))}
      onFallback={() => set(min)}
    />
  );
}

/** Teto de DPR por tipo de tela (a qualidade adaptativa parte daqui). */
export const dprCap = (compact: boolean) => (compact ? 1.25 : 1.5);
