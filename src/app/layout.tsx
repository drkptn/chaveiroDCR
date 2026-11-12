import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { site } from "@/config/site";
import { basePath } from "@/lib/asset";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Chaveiro DCR | Serviços de Chaves, Fechaduras e Segurança", template: "%s | Chaveiro DCR" },
  description: site.description,
  applicationName: site.name,
  keywords: ["chaveiro", "cópia de chave", "chave tetra", "chave gorje", "fechaduras", "troca de cilindro", "abertura de portas", "chave automotiva", "Chaveiro DCR"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: site.name,
    title: "Chaveiro DCR | Serviços de Chaves, Fechaduras e Segurança",
    description: site.description,
    url: "/",
    images: [{ url: `${basePath}/og.jpg`, width: 1200, height: 630, alt: "Chaveiro DCR — chave cromada e cilindro de fechadura" }],
  },
  twitter: { card: "summary_large_image", title: "Chaveiro DCR", description: site.description, images: [`${basePath}/og.jpg`] },
  icons: { icon: [{ url: `${basePath}/icon.svg`, type: "image/svg+xml" }], apple: `${basePath}/apple-icon.png` },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#090c11",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
