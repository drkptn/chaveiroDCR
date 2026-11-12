/**
 * ============================================================================
 *  CHAVEIRO DCR — INFORMAÇÕES COMERCIAIS (edite aqui)
 * ============================================================================
 *  Tudo que é dado real do negócio fica neste arquivo. Nada foi inventado:
 *  os campos vazios ("") simplesmente não aparecem no site — ou aparecem como
 *  "a definir" enquanto `showPendingSlots` estiver ligado.
 *
 *  WhatsApp / telefone: só dígitos, com DDI + DDD. Ex.: "5511999998888".
 * ============================================================================
 */
type SiteConfig = {
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  url: string;
  contact: {
    whatsapp: string;
    phone: string;
    phoneDisplay: string;
    area: string;
    address: { street: string; city: string; state: string; postalCode: string };
    hours: { days: string; hours: string }[];
    instagram: string;
  };
  showPendingSlots: boolean;
  whatsappGreeting: string;
};

export const site: SiteConfig = {
  name: "Chaveiro DCR",
  shortName: "DCR",
  tagline: "Especialista em chaves e fechaduras",
  description:
    "Conheça o Chaveiro DCR. Serviços especializados em cópias de chaves, fechaduras e soluções de segurança. Entre em contato e solicite atendimento.",

  /** URL pública do site (usada no SEO/sitemap). Ex.: "https://chaveirodcr.com.br" */
  url: "https://drkptn.github.io/chaveiroDCR",

  contact: {
    /** WhatsApp com DDI + DDD, só números. Ex.: "5511999998888" */
    whatsapp: "",
    /** Telefone fixo/celular para ligação, só números. Ex.: "551133334444" */
    phone: "",
    /** Telefone formatado para exibir. Ex.: "(11) 3333-4444" */
    phoneDisplay: "",
    /** Região de atendimento ou endereço. Ex.: "Zona Sul de São Paulo" */
    area: "",
    /** Endereço completo (opcional, usado no SEO local se preenchido). */
    address: {
      street: "",
      city: "",
      state: "",
      postalCode: "",
    },
    /** Horário. Ex.: [{ days: "Seg a Sex", hours: "8h às 18h" }] */
    hours: [],
    /** Instagram sem @. Ex.: "chaveirodcr" */
    instagram: "",
  },

  /** Mostra os espaços de contato ainda não preenchidos como "a definir". */
  showPendingSlots: true,

  /** Mensagem-base do WhatsApp. */
  whatsappGreeting: "Olá! Conheci o Chaveiro DCR pelo site e gostaria de solicitar um atendimento.",
};

export const navigation = [
  { id: "inicio", label: "Início" },
  { id: "servicos", label: "Serviços" },
  { id: "especialidades", label: "Especialidades" },
  { id: "sobre", label: "Sobre" },
  { id: "contato", label: "Contato" },
] as const;

/** Seções na ordem da página — cada uma "corta" um dente da chave da navbar. */
export const sectionsOrder = [
  "inicio",
  "servicos",
  "especialidades",
  "mecanismo",
  "atendimento",
  "diferenciais",
  "trabalhos",
  "sobre",
  "contato",
] as const;
