"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { heroState } from "@/three/scenes/heroState";
import { explodedState, ringState } from "@/three/scenes/sceneState";
const HeroScene = dynamic(() => import("@/three/scenes/HeroScene"), { ssr: false });
const ExplodedScene = dynamic(() => import("@/three/scenes/ExplodedScene"), { ssr: false });
const KeyRingScene = dynamic(() => import("@/three/scenes/KeyRingScene"), { ssr: false });
export default function T() {
  const [scene, setScene] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const v = parseFloat(q.get("p") ?? "0");
    heroState.p = v; heroState.ps = v; heroState.frozen = q.has("f");
    explodedState.p = v; explodedState.focus = parseInt(q.get("focus") ?? "-1"); (window as any).__exp = explodedState;
    ringState.selected = parseInt(q.get("sel") ?? "0");
    setScene(q.get("scene") ?? "hero");
  }, []);
  return <div style={{ position: "fixed", inset: 0, background: "#090c11" }}>
    {scene === "hero" && <HeroScene compact={false} active />}
    {scene === "exploded" && <ExplodedScene compact={false} active />}
    {scene === "ring" && <KeyRingScene compact={false} active />}
  </div>;
}
