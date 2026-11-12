import { activeCategories } from "@/config/services";
import { site } from "@/config/site";

/**
 * Schema.org — "Locksmith" (LocalBusiness). Só entram campos realmente preenchidos
 * em src/config/site.ts: nada de endereço, telefone ou horário inventados.
 */
export function structuredData() {
  const c = site.contact;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Locksmith",
    name: site.name,
    description: site.description,
    url: site.url,
    image: `${site.url}/og.jpg`,
    logo: `${site.url}/icon.svg`,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Serviços",
      itemListElement: activeCategories().map((cat) => ({
        "@type": "OfferCatalog",
        name: cat.title,
        itemListElement: cat.items
          .filter((i) => i.status === "ativo")
          .map((i) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: i.name } })),
      })),
    },
  };
  const phone = c.phone || c.whatsapp;
  if (phone) data.telephone = `+${phone.replace(/\D/g, "")}`;
  if (c.area) data.areaServed = c.area;
  const a = c.address;
  if (a.street || a.city) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: a.street || undefined,
      addressLocality: a.city || undefined,
      addressRegion: a.state || undefined,
      postalCode: a.postalCode || undefined,
      addressCountry: "BR",
    };
  }
  if (c.instagram) data.sameAs = [`https://instagram.com/${c.instagram}`];
  if (c.hours.length) data.openingHours = c.hours.map((h) => `${h.days} ${h.hours}`);
  return data;
}
