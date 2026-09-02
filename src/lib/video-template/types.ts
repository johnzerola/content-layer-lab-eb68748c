/**
 * Modelo de dados dos TEMPLATES DE VÍDEO reutilizáveis do VaiViral.
 *
 * Um template NÃO é um vídeo: ele guarda layout, camadas, posições relativas
 * (em porcentagem do canvas), estilos, filtros, animações e *bindings*.
 * O vídeo usado durante a criação serve apenas de prévia.
 */

export const TEMPLATE_DOC_VERSION = 1;

/** Origem do conteúdo de uma camada quando o template é aplicado. */
export type BindingType =
  | "STATIC"
  | "MAIN_VIDEO"
  | "CUT_VIDEO"
  | "CUT_COVER"
  | "THUMBNAIL"
  | "CAPTIONS"
  | "TITLE"
  | "USER_LOGO"
  | "BRAND_LOGO"
  | "USER_MEDIA"
  | "CUSTOM";

export const BINDING_LABELS: Record<BindingType, string> = {
  STATIC: "Fixo",
  MAIN_VIDEO: "Vídeo principal",
  CUT_VIDEO: "Vídeo do corte",
  CUT_COVER: "Capa do corte",
  THUMBNAIL: "Miniatura",
  CAPTIONS: "Legendas",
  TITLE: "Título do vídeo",
  USER_LOGO: "Logo do usuário",
  BRAND_LOGO: "Logo da marca",
  USER_MEDIA: "Mídia do usuário",
  CUSTOM: "Personalizado",
};

export type LayerType = "text" | "image" | "video" | "shape" | "caption";

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

export const ASPECT_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut";

export interface AnimationSpec {
  type: string;
  duration: number;
  delay: number;
  easing: Easing;
  /** multiplicador de velocidade (1 = normal) */
  speed?: number;
  /** sentido da animação */
  direction?: "normal" | "reverse" | "alternate";
}

/** Filtro real: valores numéricos, nunca só o nome do preset. */
export interface FilterValues {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  sepia: number;
  grayscale: number;
  temperature: number;
  blur: number;
}

export const NEUTRAL_FILTER: FilterValues = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  sepia: 0,
  grayscale: 0,
  temperature: 0,
  blur: 0,
};

export interface BaseLayer {
  id: string;
  name: string;
  type: LayerType;
  bindingType: BindingType;
  /** posições relativas ao canvas, em porcentagem (0–100) */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  flipX?: boolean;
  flipY?: boolean;
  /** janela de tempo (segundos). endTime null = até o fim do vídeo */
  startTime: number;
  endTime: number | null;
  animationIn?: AnimationSpec | null;
  animationOut?: AnimationSpec | null;
  animationLoop?: AnimationSpec | null;
  filter?: Partial<FilterValues> | null;
}

export interface TextLayer extends BaseLayer {
  type: "text";
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  letterSpacing: number;
  lineHeight: number;
  uppercase: boolean;
  italic: boolean;
  underline: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  background: string | null;
  padding: number;
  radius: number;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  src: string | null;
  fit: "cover" | "contain" | "fill";
  radius: number;
}

export interface VideoLayer extends BaseLayer {
  type: "video";
  src: string | null;
  fit: "cover" | "contain" | "fill";
  radius: number;
  muted: boolean;
  volume: number;
  speed: number;
  loop: boolean;
  backgroundBlur: number;
  mask: "none" | "circle" | "rounded";
  chromaKey?: { enabled: boolean; color: string; tolerance: number; softness: number } | null;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "rounded" | "circle" | "line";
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface CaptionLayerStyle {
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  highlight: "color" | "box" | "underline" | "scale";
  highlightColor: string;
  background: string | null;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  uppercase: boolean;
  maxWords: number;
  maxLines: number;
  align: "left" | "center" | "right";
  mode: "karaoke" | "word" | "line";
}

export interface CaptionLayer extends BaseLayer {
  type: "caption";
  bindingType: "CAPTIONS";
  presetId: string;
  style: CaptionLayerStyle;
}

export type TemplateLayer = TextLayer | ImageLayer | VideoLayer | ShapeLayer | CaptionLayer;

export type TemplateBackground =
  | { kind: "none" }
  | { kind: "color"; color: string }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; src: string | null }
  | { kind: "video"; src: string | null };

export interface TemplateDoc {
  version: number;
  name: string;
  aspectRatio: AspectRatio;
  canvas: {
    width: number;
    height: number;
    background: TemplateBackground;
  };
  filter: FilterValues;
  layers: TemplateLayer[];
  /** vídeo apenas de prévia durante a criação — nunca vira conteúdo final */
  sampleVideoUrl?: string | null;
  settings?: Record<string, unknown>;
}

export type TemplateVisibility = "private" | "public";
export type TemplateStatus = "draft" | "published";

export interface VideoTemplateRecord {
  id: string;
  user_id: string;
  workspace_id: string | null;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  aspect_ratio: AspectRatio;
  canvas_width: number;
  canvas_height: number;
  template_data: TemplateDoc;
  template_version: number;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  category: string | null;
  tags: string[];
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateInstanceRecord {
  id: string;
  template_id: string | null;
  template_version: number | null;
  user_id: string;
  video_id: string | null;
  cut_id: string | null;
  project_id: string | null;
  label: string | null;
  instance_data: TemplateDoc;
  created_at: string;
  updated_at: string;
}

/** Fonte real (corte/vídeo/export) usada para resolver os bindings. */
export interface BindableVideoSource {
  id: string;
  title?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  captions?: unknown;
  userLogoUrl?: string | null;
  brandLogoUrl?: string | null;
  media?: Record<string, string>;
}
