/**
 * Temas do ChatScene — apenas apresentação.
 *
 * Um tema não conhece tempo, nem mensagem, nem render: é só um conjunto de
 * valores de cor, tipografia e forma. Identidade própria: nenhuma reprodução
 * fiel de interface de terceiros nem uso de logotipos alheios.
 */

export interface ChatTheme {
  id: string;
  label: string;
  description: string;
  /** fundo da cena, atrás do painel da conversa */
  background: string;
  backgroundAlt: string;
  /** painel da conversa */
  surface: string;
  header: string;
  headerText: string;
  headerMuted: string;
  divider: string;
  /** bolha de quem escreve a história */
  selfBubble: string;
  selfText: string;
  /** bolha dos outros participantes */
  peerBubble: string;
  peerText: string;
  /** avisos de sistema */
  systemText: string;
  systemBubble: string;
  /** nome do autor acima da bolha, em conversa de grupo */
  nameText: string;
  fontFamily: string;
  /** raio da bolha em proporção da altura da linha */
  radius: number;
}

type ThemeFamily = { id: string; label: string; description: string; dark: ChatTheme; light: ChatTheme };

const FONT = "'Figtree', 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

const FAMILIES: ThemeFamily[] = [
  {
    id: "noite",
    label: "Noite",
    description: "Azul-noite com violeta — a identidade VaiViral.",
    
    dark: {
      id: "noite",
      label: "Noite",
      description: "",
      background: "#0b0b17",
      backgroundAlt: "#15152b",
      surface: "#11111f",
      header: "#181830",
      headerText: "#f4f4ff",
      headerMuted: "#9b9bc4",
      divider: "#26264a",
      selfBubble: "#7c5cff",
      selfText: "#ffffff",
      peerBubble: "#222240",
      peerText: "#ececff",
      systemText: "#9b9bc4",
      systemBubble: "#1a1a33",
      nameText: "#b7b7e6",
      fontFamily: FONT,
      radius: 0.42,
    },
    light: {
      id: "noite",
      label: "Noite",
      description: "",
      background: "#eeeef8",
      backgroundAlt: "#ffffff",
      surface: "#f7f7ff",
      header: "#ffffff",
      headerText: "#14142b",
      headerMuted: "#6b6b90",
      divider: "#e0e0f0",
      selfBubble: "#7c5cff",
      selfText: "#ffffff",
      peerBubble: "#ffffff",
      peerText: "#15152b",
      systemText: "#6b6b90",
      systemBubble: "#e7e7f6",
      nameText: "#5b5b8a",
      fontFamily: FONT,
      radius: 0.42,
    },
  },
  {
    id: "menta",
    label: "Menta",
    description: "Verde suave, leitura leve e cotidiana.",
    dark: {
      id: "menta",
      label: "Menta",
      description: "",
      background: "#07130f",
      backgroundAlt: "#0f2019",
      surface: "#0b1a15",
      header: "#12241d",
      headerText: "#eafff6",
      headerMuted: "#82b3a2",
      divider: "#1d3830",
      selfBubble: "#22c08a",
      selfText: "#04231a",
      peerBubble: "#172e26",
      peerText: "#e6fff5",
      systemText: "#82b3a2",
      systemBubble: "#12241d",
      nameText: "#8fe0c2",
      fontFamily: FONT,
      radius: 0.4,
    },
    light: {
      id: "menta",
      label: "Menta",
      description: "",
      background: "#e7f5ef",
      backgroundAlt: "#ffffff",
      surface: "#f2fbf7",
      header: "#ffffff",
      headerText: "#07281e",
      headerMuted: "#5b8a7a",
      divider: "#d5e9e0",
      selfBubble: "#1fbf87",
      selfText: "#04231a",
      peerBubble: "#ffffff",
      peerText: "#07281e",
      systemText: "#5b8a7a",
      systemBubble: "#dff0e8",
      nameText: "#2f7d63",
      fontFamily: FONT,
      radius: 0.4,
    },
  },
  {
    id: "papel",
    label: "Papel",
    description: "Bege editorial, ritmo de livro — bom para drama lento.",
    dark: {
      id: "papel",
      label: "Papel",
      description: "",
      background: "#14110c",
      backgroundAlt: "#221c13",
      surface: "#1a1610",
      header: "#241e15",
      headerText: "#f6eddc",
      headerMuted: "#b6a488",
      divider: "#372e21",
      selfBubble: "#c9a227",
      selfText: "#1b1508",
      peerBubble: "#2b241a",
      peerText: "#f4ecdc",
      systemText: "#b6a488",
      systemBubble: "#241e15",
      nameText: "#d8c08a",
      fontFamily: FONT,
      radius: 0.3,
    },
    light: {
      id: "papel",
      label: "Papel",
      description: "",
      background: "#f2e9d8",
      backgroundAlt: "#fbf6ec",
      surface: "#faf4e8",
      header: "#fffaf0",
      headerText: "#2b2314",
      headerMuted: "#8b7a5c",
      divider: "#e6d9c0",
      selfBubble: "#c9a227",
      selfText: "#221b0a",
      peerBubble: "#fffaf0",
      peerText: "#2b2314",
      systemText: "#8b7a5c",
      systemBubble: "#eee2cb",
      nameText: "#7a6538",
      fontFamily: FONT,
      radius: 0.3,
    },
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Monoespaçado e cru — suspense, mistério, true crime.",
    dark: {
      id: "terminal",
      label: "Terminal",
      description: "",
      background: "#05060a",
      backgroundAlt: "#0a0d14",
      surface: "#070910",
      header: "#0d1019",
      headerText: "#c9f7d8",
      headerMuted: "#5f7a68",
      divider: "#161d26",
      selfBubble: "#1d3b2a",
      selfText: "#b9ffd3",
      peerBubble: "#121722",
      peerText: "#d6e2ef",
      systemText: "#5f7a68",
      systemBubble: "#0d1019",
      nameText: "#6fe39b",
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      radius: 0.12,
    },
    light: {
      id: "terminal",
      label: "Terminal",
      description: "",
      background: "#e8ebee",
      backgroundAlt: "#f6f8fa",
      surface: "#f1f3f6",
      header: "#ffffff",
      headerText: "#0b1220",
      headerMuted: "#5c6b7a",
      divider: "#dbe1e8",
      selfBubble: "#c9ead6",
      selfText: "#0b2418",
      peerBubble: "#ffffff",
      peerText: "#0b1220",
      systemText: "#5c6b7a",
      systemBubble: "#e2e7ec",
      nameText: "#2b7a52",
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      radius: 0.12,
    },
  },
];

export const CHAT_THEMES = FAMILIES.map((f) => ({
  id: f.id,
  label: f.label,
  description: f.description,
}));

export function resolveTheme(themeId: string, dark: boolean): ChatTheme {
  const family = FAMILIES.find((f) => f.id === themeId) ?? FAMILIES[0]!;
  const theme = dark ? family.dark : family.light;
  return { ...theme, label: family.label, description: family.description };
}
