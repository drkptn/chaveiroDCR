/**
 * Catálogo técnico — "O universo das chaves".
 * Conteúdo de referência (conhecimento do ofício), NÃO é uma lista de serviços
 * garantidos. Os serviços oferecidos ficam em `services.ts`.
 */
export type KeyModel =
  | "yale"
  | "tetra"
  | "gorje"
  | "dimple"
  | "track"
  | "auto"
  | "flip"
  | "transponder"
  | "tubular"
  | "highsec"
  | "padlock"
  | "safe";

export type KeyType = {
  id: KeyModel;
  name: string;
  alias?: string;
  summary: string;
  features: string[];
  uses: string[];
  /** Parâmetros do esquema técnico (desenho SVG). */
  spec: { label: string; value: string }[];
};

export const keyTypes: KeyType[] = [
  {
    id: "yale",
    name: "Chave Yale",
    alias: "chave plana serrilhada",
    summary:
      "A chave mais comum do dia a dia. Os cortes (segredo) ficam em uma das bordas e posicionam os pinos do cilindro na altura exata para liberar o giro.",
    features: ["Lâmina plana", "Cortes em uma borda", "Sulcos laterais que definem o perfil"],
    uses: ["Portas residenciais", "Portões", "Armários e caixas de correio"],
    spec: [
      { label: "Segredo", value: "cortes na borda" },
      { label: "Mecanismo", value: "pinos (pin tumbler)" },
      { label: "Perfil", value: "sulcos laterais" },
    ],
  },
  {
    id: "tetra",
    name: "Chave Tetra",
    alias: "quatro lâminas",
    summary:
      "Seção em cruz com quatro lâminas, cada uma com seus próprios cortes. Atua em quatro fileiras de pinos ao mesmo tempo, o que aumenta a complexidade do segredo.",
    features: ["Seção em cruz (+)", "Quatro faces com cortes", "Maior número de combinações"],
    uses: ["Portas de entrada", "Fechaduras de sobrepor", "Portas comerciais"],
    spec: [
      { label: "Segredo", value: "4 lâminas cortadas" },
      { label: "Mecanismo", value: "4 fileiras de pinos" },
      { label: "Seção", value: "cruciforme" },
    ],
  },
  {
    id: "gorje",
    name: "Chave Gorje",
    alias: "chave de gorja",
    summary:
      "Haste cilíndrica com uma paleta na ponta. Os recortes da paleta levantam as gorjas (alavancas) internas da fechadura até alinhar a passagem do trinco.",
    features: ["Haste redonda", "Paleta com recortes", "Aciona gorjas (alavancas)"],
    uses: ["Portas antigas", "Portões", "Fechaduras de embutir tradicionais"],
    spec: [
      { label: "Segredo", value: "recortes na paleta" },
      { label: "Mecanismo", value: "gorjas / alavancas" },
      { label: "Haste", value: "cilíndrica" },
    ],
  },
  {
    id: "dimple",
    name: "Chave Multiponto",
    alias: "chave de pontos",
    summary:
      "Em vez de cortes na borda, o segredo é formado por cavidades (pontos) fresadas nas faces da lâmina, que atuam em pinos posicionados em diferentes ângulos.",
    features: ["Cavidades nas faces", "Geralmente reversível", "Pinos em vários eixos"],
    uses: ["Cilindros de segurança", "Portas de apartamento", "Portas comerciais"],
    spec: [
      { label: "Segredo", value: "cavidades fresadas" },
      { label: "Mecanismo", value: "pinos multidirecionais" },
      { label: "Uso", value: "reversível" },
    ],
  },
  {
    id: "track",
    name: "Chave Pantográfica",
    alias: "trilha fresada",
    summary:
      "O segredo é uma trilha ondulada usinada na face da lâmina. A reprodução exige máquina de cópia por fresagem, que acompanha o perfil original com precisão.",
    features: ["Trilha ondulada na face", "Usinagem por fresagem", "Bordas sem serrilhado"],
    uses: ["Cilindros de alta precisão", "Veículos", "Sistemas de segurança"],
    spec: [
      { label: "Segredo", value: "trilha usinada" },
      { label: "Cópia", value: "fresagem" },
      { label: "Perfil", value: "liso nas bordas" },
    ],
  },
  {
    id: "auto",
    name: "Chave Automotiva",
    alias: "lâmina + cabeça",
    summary:
      "Combina uma lâmina — muitas vezes com trilha fresada — e uma cabeça plástica que pode abrigar componentes eletrônicos. Cada fabricante usa perfis próprios.",
    features: ["Perfis específicos por marca", "Cabeça plástica", "Pode conter transponder"],
    uses: ["Ignição", "Portas do veículo", "Porta-malas"],
    spec: [
      { label: "Lâmina", value: "trilha ou cortes" },
      { label: "Cabeça", value: "polímero" },
      { label: "Eletrônica", value: "conforme modelo" },
    ],
  },
  {
    id: "flip",
    name: "Chave Canivete",
    alias: "lâmina retrátil",
    summary:
      "A lâmina se recolhe dentro do corpo por um mecanismo de mola e se abre ao toque de um botão. Normalmente integra controle remoto e transponder.",
    features: ["Lâmina retrátil", "Mecanismo de mola", "Controle integrado"],
    uses: ["Veículos", "Chave + alarme no mesmo corpo"],
    spec: [
      { label: "Lâmina", value: "articulada" },
      { label: "Acionamento", value: "botão + mola" },
      { label: "Integra", value: "controle remoto" },
    ],
  },
  {
    id: "transponder",
    name: "Chave com Transponder",
    alias: "chip de identificação",
    summary:
      "Um pequeno chip na cabeça da chave conversa com o sistema do veículo. Sem a identificação correta, o imobilizador não libera a partida, mesmo com a lâmina certa.",
    features: ["Chip passivo na cabeça", "Comunicação por rádio", "Requer programação/pareamento"],
    uses: ["Veículos com imobilizador"],
    spec: [
      { label: "Segredo", value: "mecânico + eletrônico" },
      { label: "Chip", value: "transponder passivo" },
      { label: "Etapa extra", value: "programação" },
    ],
  },
  {
    id: "tubular",
    name: "Chave Tubular",
    alias: "chave circular",
    summary:
      "Os pinos ficam dispostos em círculo, e a ponta tubular da chave tem entalhes em profundidades diferentes que empurram cada pino até a posição correta.",
    features: ["Ponta cilíndrica oca", "Entalhes ao redor", "Pinos em círculo"],
    uses: ["Máquinas e cofres de moeda", "Travas de bicicleta", "Gabinetes e alarmes"],
    spec: [
      { label: "Segredo", value: "entalhes radiais" },
      { label: "Mecanismo", value: "pinos circulares" },
      { label: "Ponta", value: "tubular" },
    ],
  },
  {
    id: "highsec",
    name: "Chaves de Alta Segurança",
    alias: "perfil controlado",
    summary:
      "Perfis especiais, elementos móveis e barras laterais tornam a cópia controlada. Em muitos sistemas, a reprodução depende de cartão de propriedade.",
    features: ["Perfil exclusivo", "Elementos ativos", "Cópia controlada"],
    uses: ["Portas de alta segurança", "Empresas", "Sistemas mestrados"],
    spec: [
      { label: "Segredo", value: "múltiplas camadas" },
      { label: "Elementos", value: "móveis / laterais" },
      { label: "Cópia", value: "controlada" },
    ],
  },
  {
    id: "padlock",
    name: "Chaves de Cadeado",
    alias: "chave de cadeado",
    summary:
      "Variam conforme o cadeado: de chaves planas simples a modelos tetra e de pontos. A escolha do cadeado define o nível de segurança.",
    features: ["Formato compacto", "Diversos perfis", "Cilindro integrado ao corpo"],
    uses: ["Portões e correntes", "Armários", "Bagagens e depósitos"],
    spec: [
      { label: "Segredo", value: "varia por modelo" },
      { label: "Corpo", value: "latão / aço" },
      { label: "Haste", value: "aço temperado" },
    ],
  },
  {
    id: "safe",
    name: "Chaves Especiais",
    alias: "cofres e sistemas dedicados",
    summary:
      "Chaves de cofre de paleta dupla, modelos cruciformes e outros sistemas dedicados. Cada caso exige avaliação técnica antes de qualquer procedimento.",
    features: ["Paleta dupla", "Haste longa", "Projetos dedicados"],
    uses: ["Cofres", "Arquivos e gavetas", "Equipamentos específicos"],
    spec: [
      { label: "Segredo", value: "paleta dupla" },
      { label: "Haste", value: "longa / reforçada" },
      { label: "Avaliação", value: "caso a caso" },
    ],
  },
];
