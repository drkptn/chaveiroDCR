import type { NextConfig } from "next";

/**
 * Site 100% estático (pasta /out) — hospeda em qualquer lugar.
 * Para publicar numa subpasta (ex.: GitHub Pages), defina NEXT_PUBLIC_BASE_PATH=/chaveiroDCR
 * O estúdio de renders (/estudio) só existe com STUDIO=1 (npm run studio).
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
const studio = process.env.STUDIO === "1";

const nextConfig: NextConfig = {
  output: studio ? undefined : "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  pageExtensions: studio ? ["studio.tsx", "tsx", "ts"] : ["tsx", "ts"],
  reactStrictMode: true,
  devIndicators: false,
  agentRules: false,
};

export default nextConfig;
