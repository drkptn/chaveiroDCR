"use client";

import { useEffect, useRef } from "react";
import { light } from "@/lib/light";

/**
 * Metal líquido — raymarching de metaballs em GLSL (WebGL puro, sem three.js).
 * O reflexo vem de um "estúdio" procedural; uma das gotas é atraída pela lanterna
 * (cursor) e o brilho especular acompanha a luz. Em tela de toque, a gota passeia.
 */
const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uSteps;
out vec4 o;

float smin(float a, float b, float k){ float h = clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }

float map(vec3 q){
  float t = uTime*.45;
  float d = length(q - vec3(sin(t)*.55, cos(t*1.3)*.35, sin(t*.7)*.3)) - .62;
  d = smin(d, length(q - vec3(cos(t*.8)*.7, sin(t*.9)*.5, cos(t*1.1)*.25)) - .46, .55);
  d = smin(d, length(q - vec3(sin(t*1.2+2.)*.6, -.55+sin(t*.6)*.2, .2)) - .38, .5);
  d = smin(d, length(q - vec3(uMouse*vec2(1.25,1.0), .45)) - .34, .65);
  // ondulação de superfície
  d += sin(q.x*7.+t*2.)*sin(q.y*6.-t*1.6)*.012;
  return d;
}
vec3 nrm(vec3 p){ vec2 e=vec2(.0015,0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }

vec3 env(vec3 r){
  float y = r.y;
  vec3 c = mix(vec3(.015,.02,.03), vec3(.06,.09,.13), smoothstep(-.6,.2,y));
  c += vec3(.92,.96,1.) * smoothstep(.12,.55,y) * 1.05;           // céu / softbox de teto
  c -= vec3(.9) * smoothstep(.06,.0,abs(y-.06)) * .6;               // horizonte escuro
  c += vec3(1.) * smoothstep(.86,.97,abs(r.x)) * smoothstep(-.3,.5,y) * 1.4; // faixas laterais
  c += vec3(0.,.78,1.) * smoothstep(.75,1.,-r.z) * smoothstep(-.2,.3,y) * .45; // contraluz ciano
  c += vec3(.86,.68,.4) * smoothstep(-.15,-.75,y) * .32;            // chão quente (latão)
  return max(c, 0.);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes) / min(uRes.x,uRes.y);
  vec3 ro = vec3(0.,0.,4.6);
  vec3 rd = normalize(vec3(uv, -1.65));
  float t = 0.; float hit = 0.;
  for(int i=0;i<90;i++){
    if(float(i) >= uSteps) break;
    vec3 pp = ro + rd*t;
    float d = map(pp);
    if(d < .0015){ hit = 1.; break; }
    t += d*.9;
    if(t > 6.) break;
  }
  if(hit < .5){ o = vec4(0.); return; }
  vec3 p = ro + rd*t;
  vec3 n = nrm(p);
  vec3 r = reflect(rd, n);
  vec3 col = env(r);
  float fres = pow(1. - max(dot(n,-rd),0.), 3.);
  col = mix(col*vec3(.86,.9,.95), env(r)*1.2, fres);
  // lanterna: especular móvel
  vec3 L = normalize(vec3(uMouse*1.6, 1.4));
  col += vec3(1.) * pow(max(dot(r, L), 0.), 60.) * 2.2;
  col += vec3(.5,.9,1.) * pow(max(dot(r, L), 0.), 8.) * .12;
  col = col/(1.+col*.35);
  col = pow(col, vec3(.92));
  o = vec4(col, 1.);
}`;

export function LiquidChrome({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const gl = cv.getContext("webgl2", { premultipliedAlpha: false, antialias: false, alpha: true });
    if (!gl) {
      cv.style.display = "none";
      return;
    }
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (process.env.NODE_ENV !== "production") console.warn("LiquidChrome:", gl.getProgramInfoLog(prog), gl.getShaderInfoLog(gl.getAttachedShaders(prog)![1]));
      cv.style.display = "none";
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uSteps = gl.getUniformLocation(prog, "uSteps");

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // metal líquido tem bordas suaves: meia resolução (sem multiplicar pelo DPR) é imperceptível e ~6x mais leve
    const scale = coarse ? 0.42 : 0.5;
    gl.uniform1f(uSteps, coarse ? 44 : 64);

    const resize = () => {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(2, Math.round(r.width * scale));
      cv.height = Math.max(2, Math.round(r.height * scale));
      gl.viewport(0, 0, cv.width, cv.height);
      gl.uniform2f(uRes, cv.width, cv.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "100px" });
    io.observe(cv);

    let raf = 0;
    let mx = 0.3;
    let my = 0.1;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const r = cv.getBoundingClientRect();
      // posição da lanterna relativa ao canvas (-1..1)
      const tx = ((light.px - (r.left + r.width / 2)) / (r.width / 2)) * 0.9;
      const ty = (-(light.py - (r.top + r.height / 2)) / (r.height / 2)) * 0.9;
      mx += (Math.max(-1.4, Math.min(1.4, tx)) - mx) * 0.06;
      my += (Math.max(-1.2, Math.min(1.2, ty)) - my) * 0.06;
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uTime, reduce ? 4 : (now - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (reduce) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      // sem loseContext(): o StrictMode remonta o efeito no mesmo canvas
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
