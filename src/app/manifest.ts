import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { basePath } from "@/lib/asset";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.name,
    short_name: site.shortName,
    description: site.description,
    start_url: `${basePath}/`,
    display: "standalone",
    background_color: "#090c11",
    theme_color: "#090c11",
    icons: [
      { src: `${basePath}/icon.svg`, sizes: "any", type: "image/svg+xml" },
      { src: `${basePath}/apple-icon.png`, sizes: "180x180", type: "image/png" },
    ],
  };
}
