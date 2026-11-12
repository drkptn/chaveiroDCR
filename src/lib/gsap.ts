"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
  ScrollTrigger.config({ ignoreMobileResize: true });
  gsap.defaults({ ease: "power3.out" });
}

/** Curvas próprias do DCR: "usinagem" (entra firme e assenta) e "trava" (estalo mecânico). */
export const EASE = {
  machine: "expo.out",
  latch: "back.out(2.2)",
  glide: "power2.inOut",
} as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
