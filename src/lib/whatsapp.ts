import { site } from "@/config/site";

/** Monta o link do WhatsApp com a mensagem pré-preenchida. */
export function whatsappLink(message: string = site.whatsappGreeting) {
  const text = encodeURIComponent(message.trim());
  const number = site.contact.whatsapp.replace(/\D/g, "");
  // Sem número configurado, o WhatsApp abre a mensagem e deixa o cliente escolher o contato.
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

export const hasWhatsapp = () => site.contact.whatsapp.replace(/\D/g, "").length >= 10;

export function formatPhone(digits: string) {
  const d = digits.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}
