/**
 * ============================================================================
 *  SERVIÇOS — ative, desative ou edite à vontade
 * ============================================================================
 *  status:
 *   - "ativo"     → aparece como serviço oferecido.
 *   - "consultar" → aparece com a etiqueta "sob consulta" (use enquanto não
 *                   houver confirmação de que o serviço é oferecido).
 *   - "oculto"    → não aparece no site.
 *
 *  Para desligar uma categoria inteira: `enabled: false`.
 *  Observação: o Chaveiro DCR NÃO trabalha com carimbos — não adicionar.
 * ============================================================================
 */
export type ServiceStatus = "ativo" | "consultar" | "oculto";

export type ServiceItem = { name: string; status: ServiceStatus; note?: string };

export type ServiceCategory = {
  id: string;
  enabled: boolean;
  code: string;
  title: string;
  short: string;
  description: string;
  /** Nome do render 360° em /public/renders (gerado pelo estúdio). */
  render: string;
  icon: "copy" | "car" | "cylinder" | "door" | "shield";
  /** Observação técnica exibida dentro da gaveta. */
  footnote?: string;
  items: ServiceItem[];
};

export const serviceCategories: ServiceCategory[] = [
  {
    id: "copias",
    enabled: true,
    code: "CP",
    title: "Cópias de chaves",
    short: "Cópia de chave",
    description: "Reprodução de chaves residenciais, comerciais e especiais, com atenção ao perfil e aos cortes de cada modelo.",
    render: "copias",
    icon: "copy",
    footnote:
      "A reprodução depende do modelo, das características e da disponibilidade da chave original ou dos dados necessários.",
    items: [
      { name: "Cópia de chave comum", status: "ativo" },
      { name: "Cópia de chave residencial", status: "ativo" },
      { name: "Cópia de chave tetra", status: "ativo" },
      { name: "Cópia de chave multiponto", status: "ativo" },
      { name: "Cópia de chave gorje", status: "ativo" },
      { name: "Cópia de chave pantográfica", status: "consultar", note: "quando aplicável" },
      { name: "Cópia de chaves especiais", status: "consultar" },
    ],
  },
  {
    id: "automotivas",
    enabled: true,
    code: "AU",
    title: "Chaves automotivas",
    short: "Chave automotiva",
    description: "Soluções para chaves de veículos — da cópia simples às chaves com transponder e controle remoto.",
    render: "automotivas",
    icon: "car",
    footnote: "Disponibilidade varia conforme marca, modelo e ano do veículo. Consulte antes do atendimento.",
    items: [
      { name: "Cópia de chaves automotivas", status: "consultar" },
      { name: "Chaves com transponder", status: "consultar" },
      { name: "Chaves codificadas", status: "consultar" },
      { name: "Chaves com controle remoto", status: "consultar" },
      { name: "Chaves canivete", status: "consultar" },
      { name: "Programação de chaves automotivas", status: "consultar" },
      { name: "Soluções para chaves perdidas", status: "consultar" },
    ],
  },
  {
    id: "fechaduras",
    enabled: true,
    code: "FC",
    title: "Fechaduras e cilindros",
    short: "Fechadura / cilindro",
    description: "Instalação, troca e manutenção de fechaduras e cilindros, com ajuste fino de cada mecanismo.",
    render: "fechaduras",
    icon: "cylinder",
    items: [
      { name: "Instalação de fechaduras", status: "ativo" },
      { name: "Substituição de fechaduras", status: "ativo" },
      { name: "Manutenção de fechaduras", status: "ativo" },
      { name: "Troca de cilindros", status: "ativo" },
      { name: "Ajustes em mecanismos", status: "ativo" },
      { name: "Reparos em fechaduras", status: "ativo" },
      { name: "Substituição de componentes", status: "ativo" },
      { name: "Avaliação de sistemas de travamento", status: "ativo" },
    ],
  },
  {
    id: "abertura",
    enabled: true,
    code: "AB",
    title: "Abertura de portas",
    short: "Abertura de porta",
    description: "Abertura técnica de portas residenciais e comerciais, buscando preservar a fechadura sempre que possível.",
    render: "abertura",
    icon: "door",
    footnote:
      "Todo procedimento de abertura é feito somente com a autorização do proprietário ou responsável pelo imóvel.",
    items: [
      { name: "Abertura de portas residenciais", status: "ativo" },
      { name: "Abertura de portas comerciais", status: "ativo" },
      { name: "Abertura de portas trancadas", status: "ativo" },
      { name: "Abertura em caso de perda de chave", status: "ativo" },
      { name: "Atendimento emergencial", status: "consultar" },
    ],
  },
  {
    id: "seguranca",
    enabled: true,
    code: "SG",
    title: "Segurança e sistemas especiais",
    short: "Sistema de segurança",
    description: "Fechaduras de segurança, digitais e eletrônicas, cadeados e avaliação de mecanismos de travamento.",
    render: "seguranca",
    icon: "shield",
    items: [
      { name: "Fechaduras de segurança", status: "ativo" },
      { name: "Fechaduras digitais", status: "consultar" },
      { name: "Fechaduras eletrônicas", status: "consultar" },
      { name: "Cadeados", status: "ativo" },
      { name: "Sistemas de travamento", status: "ativo" },
      { name: "Avaliação e substituição de mecanismos", status: "ativo" },
    ],
  },
];

export const activeCategories = () =>
  serviceCategories
    .filter((c) => c.enabled)
    .map((c) => ({ ...c, items: c.items.filter((i) => i.status !== "oculto") }))
    .filter((c) => c.items.length > 0);
