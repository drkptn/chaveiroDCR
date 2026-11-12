/**
 * Textos institucionais editáveis (processo, diferenciais, mecanismo, sobre, galeria).
 * Sem números inventados, sem depoimentos, sem certificações.
 */

export const hero = {
  label: "Chaveiro DCR | Especialista em chaves e fechaduras",
  headline: ["Segurança,", "precisão e confiança", "em cada detalhe."],
  sub: "Serviços especializados em chaves, fechaduras e soluções de segurança. Experiência, conhecimento técnico e atenção em cada atendimento.",
  indicators: ["Atendimento profissional", "Precisão técnica", "Serviços especializados", "Compromisso com a segurança"],
};

export const processSteps = [
  {
    title: "Entre em contato",
    text: "O cliente explica sua necessidade e informa qual serviço está procurando.",
  },
  {
    title: "Avaliação",
    text: "O profissional analisa a situação e identifica a solução mais adequada.",
  },
  {
    title: "Execução",
    text: "O serviço é realizado com atenção aos detalhes e cuidado com o mecanismo.",
  },
  {
    title: "Finalização",
    text: "O cliente recebe o serviço realizado e as orientações necessárias.",
  },
];

export const differentials = [
  {
    title: "Conhecimento técnico",
    text: "Entender como cada mecanismo funciona é o que permite escolher a solução certa.",
    hidden: "PINO · MOLA · ROTOR · CAME",
  },
  {
    title: "Atenção aos detalhes",
    text: "Um corte fora de medida faz a diferença. Cada detalhe é conferido.",
    hidden: "TOLERÂNCIA · AJUSTE · CONFERÊNCIA",
  },
  {
    title: "Atendimento responsável",
    text: "Procedimentos feitos com autorização e respeito ao cliente e ao imóvel.",
    hidden: "AUTORIZAÇÃO · RESPEITO",
  },
  {
    title: "Soluções adequadas",
    text: "Cada necessidade pede uma resposta própria — nem mais, nem menos do que o necessário.",
    hidden: "AVALIAR · INDICAR · RESOLVER",
  },
  {
    title: "Cuidado com os mecanismos",
    text: "Preservar a fechadura sempre que possível é parte do trabalho bem feito.",
    hidden: "PRESERVAR · LUBRIFICAR · AJUSTAR",
  },
  {
    title: "Compromisso com a qualidade",
    text: "O serviço só termina quando a chave gira com suavidade e o mecanismo responde bem.",
    hidden: "GIRO SUAVE · TRAVA FIRME",
  },
  {
    title: "Comunicação transparente",
    text: "Você entende o que será feito, por que será feito e quais são as alternativas.",
    hidden: "CLAREZA · ORIENTAÇÃO",
  },
];

/** Componentes do cilindro (seção "Conhecimento que se traduz em segurança"). */
export const cylinderParts = [
  {
    id: "body",
    name: "Corpo",
    text: "A estrutura externa que abriga todo o mecanismo e se fixa à fechadura.",
  },
  {
    id: "plug",
    name: "Rotor",
    text: "O cilindro interno que gira quando a chave certa alinha todos os pinos.",
  },
  {
    id: "keyPins",
    name: "Pinos inferiores",
    text: "Têm alturas diferentes. São eles que “leem” os cortes da chave.",
  },
  {
    id: "driverPins",
    name: "Pinos superiores",
    text: "Bloqueiam o giro enquanto atravessam a linha de corte.",
  },
  {
    id: "springs",
    name: "Molas",
    text: "Empurram cada conjunto de pinos e mantêm o cilindro travado sem a chave.",
  },
  {
    id: "shear",
    name: "Linha de corte",
    text: "A fronteira entre rotor e corpo. Com todos os pinos nela, o rotor gira livre.",
  },
  {
    id: "cam",
    name: "Came",
    text: "A peça que transmite o giro do rotor para a lingueta da fechadura.",
  },
  {
    id: "key",
    name: "Chave",
    text: "Cada corte tem uma profundidade exata — a combinação é o segredo.",
  },
] as const;

export type CylinderPartId = (typeof cylinderParts)[number]["id"];

export const about = {
  headline: "Experiência, conhecimento e dedicação em cada atendimento.",
  text: "Por trás do Chaveiro DCR existe um profissional dedicado ao trabalho com chaves, fechaduras e soluções de segurança. Cada serviço exige atenção, conhecimento dos mecanismos e responsabilidade. O compromisso é oferecer um atendimento cuidadoso, buscando sempre a solução mais adequada para cada cliente.",
  /** Foto do profissional: coloque o arquivo em /public/fotos/profissional/ e informe o nome aqui. */
  photo: "" as string,
  photoAlt: "Profissional do Chaveiro DCR",
  /** Nome do profissional (opcional). */
  name: "" as string,
  role: "Chaveiro",
};

/**
 * GALERIA — fotos reais dos trabalhos.
 * Coloque as imagens em /public/fotos/galeria/ e liste aqui.
 * Enquanto a lista estiver vazia, a galeria exibe ILUSTRAÇÕES 3D (identificadas como tal).
 */
export type GalleryPhoto = { src: string; alt: string; caption?: string; width?: number; height?: number };

export const galleryPhotos: GalleryPhoto[] = [
  // { src: "/fotos/galeria/troca-cilindro.webp", alt: "Troca de cilindro em porta residencial", caption: "Troca de cilindro" },
];
