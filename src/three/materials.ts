import * as THREE from "three";

/**
 * Materiais físicos do DCR. O "cromo" só existe porque o ambiente (Lightformers)
 * tem faixas de luz para refletir — ver StudioEnv.tsx.
 */
export type MatKey =
  | "chrome"
  | "satin"
  | "brushed"
  | "brass"
  | "brassSatin"
  | "darkSteel"
  | "plastic"
  | "rubber"
  | "glass"
  | "smoke"
  | "glow"
  | "copper";

const cache = new Map<MatKey, THREE.Material>();

export function mat(key: MatKey): THREE.Material {
  const hit = cache.get(key);
  if (hit) return hit;
  let m: THREE.Material;
  switch (key) {
    case "chrome":
      m = new THREE.MeshPhysicalMaterial({ color: "#e9eef2", metalness: 1, roughness: 0.06, envMapIntensity: 1.25 });
      break;
    case "satin":
      m = new THREE.MeshPhysicalMaterial({ color: "#c3ccd5", metalness: 1, roughness: 0.26, envMapIntensity: 1.1 });
      break;
    case "brushed":
      m = new THREE.MeshPhysicalMaterial({
        color: "#b9c2cb",
        metalness: 1,
        roughness: 0.3,
        anisotropy: 0.9,
        envMapIntensity: 1.15,
      });
      break;
    case "brass":
      m = new THREE.MeshPhysicalMaterial({ color: "#e2bd78", metalness: 1, roughness: 0.18, envMapIntensity: 1.2 });
      break;
    case "brassSatin":
      m = new THREE.MeshPhysicalMaterial({ color: "#b8924f", metalness: 1, roughness: 0.38, envMapIntensity: 1 });
      break;
    case "darkSteel":
      m = new THREE.MeshPhysicalMaterial({ color: "#5c6670", metalness: 1, roughness: 0.34, envMapIntensity: 0.9 });
      break;
    case "plastic":
      m = new THREE.MeshPhysicalMaterial({
        color: "#101317",
        metalness: 0,
        roughness: 0.42,
        clearcoat: 0.8,
        clearcoatRoughness: 0.22,
        envMapIntensity: 0.9,
      });
      break;
    case "rubber":
      m = new THREE.MeshPhysicalMaterial({ color: "#23272d", metalness: 0, roughness: 0.75, envMapIntensity: 0.6 });
      break;
    case "glass":
      m = new THREE.MeshPhysicalMaterial({
        color: "#b9d3e6",
        metalness: 0.1,
        roughness: 0.04,
        transparent: true,
        opacity: 0.16,
        envMapIntensity: 2.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      break;
    case "smoke":
      m = new THREE.MeshPhysicalMaterial({
        color: "#1d2a36",
        metalness: 0.2,
        roughness: 0.12,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.6,
        depthWrite: false,
      });
      break;
    case "glow":
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color("#4fe6ff").multiplyScalar(1.6), toneMapped: false });
      break;
    case "copper":
      m = new THREE.MeshPhysicalMaterial({ color: "#d07a4a", metalness: 1, roughness: 0.3 });
      break;
  }
  cache.set(key, m);
  return m;
}

/** Linhas técnicas (arestas) para o efeito "raio-x". */
export const edgeMaterial = () =>
  new THREE.LineBasicMaterial({ color: "#9fe9ff", transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });

export function withEdges(mesh: THREE.Mesh, threshold = 24, material = edgeMaterial()) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), material);
  lines.raycast = () => {};
  mesh.add(lines);
  return lines;
}
