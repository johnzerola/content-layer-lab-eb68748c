import { selectionFromTransformPreset, type VoiceTransformSelection } from "./voice-transform";

/** Identidades vocais sintéticas do ChatScene. Nenhum preset representa pessoa real. */
export type VoiceGender = "feminina" | "masculina" | "neutra";
export type VoiceAge = "juvenil" | "teen" | "adulta" | "madura" | "não declarada";
export type VoiceStyle =
  | "natural" | "animada" | "calma" | "seria" | "sussurro" | "nervosa"
  | "sarcastica" | "assustada" | "brava" | "autoritaria" | "dramatic" | "comedy";
export type VoiceProviderId = "lovable-ai" | "kokoro" | "elevenlabs" | "piper" | "chatterbox";
export type VoiceProviderMode = "auto" | "local" | "premium";
export type VoiceEmotion =
  | "neutral" | "happy" | "excited" | "serious" | "nervous" | "annoyed"
  | "angry-theatrical" | "sad" | "sarcastic" | "surprised" | "whisper-like";

export interface MessageVoiceDirection {
  emotion: VoiceEmotion;
  speedMultiplier: number;
  energyMultiplier: number;
  pauseBeforeMs: number;
  pauseAfterMs: number;
}

export interface VoiceProfile {
  reference?: {
    id: string;
    name: string;
    durationSec: number;
    category?: string;
    gender?: VoiceGender;
    style?: string;
  };
  id?: string;
  name?: string;
  presetId: string;
  provider?: VoiceProviderId;
  providerVoiceId?: string;
  language?: string;
  locale?: string;
  ageStyle?: VoiceAge;
  genderStyle?: VoiceGender;
  pitch?: number;
  speed: number;
  energy?: number;
  expressiveness?: number;
  roughness?: number;
  warmth?: number;
  brightness?: number;
  style: VoiceStyle;
  gain: number;
  seed?: number;
  providerSettings?: Record<string, string | number | boolean>;
  /** Pós-processamento genérico; não altera identidade nem provedor. */
  transform?: VoiceTransformSelection | undefined;
}

export interface VoiceProviderCapabilities {
  languages: string[];
  maxCharacters: number;
  controls: {
    speed: boolean; pitch: boolean; energy: boolean; expressiveness: boolean;
    roughness: boolean; warmth: boolean; brightness: boolean; emotion: boolean;
  };
  costEstimate: boolean;
  local: boolean;
}

export const PITCH_MIN = -6;
export const PITCH_MAX = 6;
export const VOICE_SAMPLE_TEXT = "Oi! Tudo bem? Tenho uma coisa para te contar.";
/** Includes the full acting direction, identity and timbre of every preset. */
export const VOICE_DIRECTION_MAX_CHARS = 1600;

export function pitchRate(pitch: number | undefined): number {
  const semitones = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch ?? 0));
  return 2 ** (semitones / 12);
}

export interface VoicePreset {
  id: string;
  label: string;
  group: "Voz local gratuita" | "Presets de atuação" | "Juvenil sintética" | "Teen" | "Adulto masculino" | "Adulto feminino" | "Família" | "Personagens";
  description: string;
  gender: VoiceGender;
  age: VoiceAge;
  providerVoice: string;
  provider?: VoiceProviderId;
  profile: Pick<VoiceProfile, "style" | "speed" | "energy" | "expressiveness" | "roughness" | "warmth" | "brightness" | "pitch">;
}

const preset = (
  id: string, label: string, group: VoicePreset["group"], description: string,
  gender: VoiceGender, age: VoiceAge, providerVoice: string,
  profile: VoicePreset["profile"], provider?: VoiceProviderId,
): VoicePreset => ({ id, label, group, description, gender, age, providerVoice, profile, ...(provider ? { provider } : {}) });

export const VOICE_PRESETS: VoicePreset[] = [
  preset("kokoro-dora", "Dora · feminina PT-BR", "Voz local gratuita", "Locutora oficial Kokoro PT-BR · idade não declarada", "feminina", "não declarada", "pf_dora", { style:"natural",speed:1,energy:.55,expressiveness:.5,roughness:.1,warmth:.5,brightness:.5,pitch:0 }, "kokoro"),
  preset("kokoro-alex", "Alex · masculina PT-BR", "Voz local gratuita", "Locutor oficial Kokoro PT-BR · idade não declarada", "masculina", "não declarada", "pm_alex", { style:"natural",speed:1,energy:.55,expressiveness:.5,roughness:.1,warmth:.5,brightness:.5,pitch:0 }, "kokoro"),
  preset("kokoro-santa", "Santa · masculina PT-BR", "Voz local gratuita", "Locutor oficial Kokoro PT-BR · idade não declarada", "masculina", "não declarada", "pm_santa", { style:"natural",speed:1,energy:.55,expressiveness:.5,roughness:.1,warmth:.5,brightness:.5,pitch:0 }, "kokoro"),
  preset("piper-cadu-local", "Cadu local · PT-BR", "Voz local gratuita", "Voz-base PT-BR distinta · Piper open source", "neutra", "adulta", "pt_BR-cadu-medium", { style:"natural",speed:1,energy:.55,expressiveness:.5,roughness:.1,warmth:.5,brightness:.5,pitch:0 }, "piper"),
  preset("piper-jeff-local", "Jeff local · PT-BR", "Voz local gratuita", "Voz-base PT-BR distinta · Piper open source", "neutra", "adulta", "pt_BR-jeff-medium", { style:"natural",speed:1,energy:.55,expressiveness:.5,roughness:.1,warmth:.5,brightness:.5,pitch:0 }, "piper"),
  ...[
    ["viral", "Viral / rápido", "adam_roblox_teen"],
    ["natural", "Natural", "adam_natural"],
    ["young", "Jovem estilizado", "adam_young"],
    ["child", "Infantilizado · experimental", "adam_child_male"],
    ["deep", "Grave", "adam_deep"],
    ["mature", "Personagem maduro", "adam_mature_character"],
    ["high", "Agudo em velocidade normal", "adam_child_pitch_only"],
  ].map(([id, label]) => preset(`faber-${id}`, `Faber — ${label}`, "Voz local gratuita", "Masculina sintética • português brasileiro", "masculina", "adulta", "pt_BR-faber-medium", { style: "natural", speed: 1, pitch: 0 }, "piper")),
  preset("piper-faber-local", "Faber local — masculino PT-BR", "Voz local gratuita", "Masculina adulta • PT-BR • roda neste computador", "masculina", "adulta", "pt_BR-faber-medium", { style:"natural",speed:1,energy:.55,expressiveness:.5,roughness:.12,warmth:.55,brightness:.5,pitch:0 }, "piper"),
  preset("acting-narrator-melancholic", "Narrador grave e melancólico", "Presets de atuação", "Grave • cinematográfico • melancólico", "masculina", "adulta", "onyx", { style:"dramatic",speed:.86,energy:.34,expressiveness:.72,roughness:.24,warmth:.5,brightness:.26,pitch:-2 }),
  preset("acting-adult-sad", "Adulto triste e contido", "Presets de atuação", "Triste • íntimo • pausado", "masculina", "adulta", "ash", { style:"calma",speed:.88,energy:.25,expressiveness:.58,roughness:.14,warmth:.42,brightness:.34,pitch:-1 }),
  preset("acting-child-sad", "Criança sintética triste", "Presets de atuação", "Juvenil • triste • delicada", "neutra", "juvenil", "shimmer", { style:"calma",speed:.9,energy:.24,expressiveness:.62,roughness:.02,warmth:.62,brightness:.68,pitch:1.5 }),
  preset("acting-child-happy", "Criança sintética alegre", "Presets de atuação", "Juvenil • alegre • espontânea", "neutra", "juvenil", "shimmer", { style:"animada",speed:1.1,energy:.78,expressiveness:.84,roughness:.02,warmth:.58,brightness:.82,pitch:1.5 }),
  preset("acting-secret-whisper", "Sussurro de segredo", "Presets de atuação", "Baixo • próximo • confidencial", "feminina", "adulta", "sage", { style:"sussurro",speed:.9,energy:.2,expressiveness:.48,roughness:.04,warmth:.7,brightness:.42,pitch:-.5 }),
  preset("acting-cinematic-dramatic", "Dramático cinematográfico", "Presets de atuação", "Intenso • narrativo • controlado", "masculina", "adulta", "onyx", { style:"dramatic",speed:.92,energy:.68,expressiveness:.88,roughness:.2,warmth:.56,brightness:.38,pitch:-1 }),
  preset("acting-natural-nervous", "Nervoso natural", "Presets de atuação", "Tenso • hesitante • realista", "neutra", "adulta", "ash", { style:"nervosa",speed:1.06,energy:.54,expressiveness:.7,roughness:.12,warmth:.38,brightness:.52,pitch:.5 }),
  preset("acting-light-sarcastic", "Sarcástico leve", "Presets de atuação", "Irônico • sutil • conversado", "feminina", "adulta", "nova", { style:"sarcastica",speed:.98,energy:.5,expressiveness:.68,roughness:.06,warmth:.38,brightness:.58,pitch:0 }),
  preset("child-boy-animated", "Criança masculina 1 — animada", "Juvenil sintética", "Juvenil masculino • animado", "masculina", "juvenil", "echo", { style:"animada",speed:1.16,energy:.9,expressiveness:.9,roughness:.1,warmth:.45,brightness:.85,pitch:2 }),
  preset("child-boy-calm", "Criança masculina 2 — suave", "Juvenil sintética", "Juvenil masculino • suave", "masculina", "juvenil", "echo", { style:"calma",speed:.94,energy:.4,expressiveness:.45,roughness:.05,warmth:.65,brightness:.72,pitch:1.5 }),
  preset("child-boy-grumpy", "Child Boy — Grumpy", "Juvenil sintética", "Juvenil masculino • impaciente", "masculina", "juvenil", "echo", { style:"brava",speed:1.08,energy:.82,expressiveness:.85,roughness:.38,warmth:.2,brightness:.65,pitch:1 }),
  preset("child-boy-raspy", "Child Boy — Raspy Cartoon", "Juvenil sintética", "Juvenil estilizado • cômico", "masculina", "juvenil", "echo", { style:"comedy",speed:1.05,energy:.75,expressiveness:.92,roughness:.66,warmth:.35,brightness:.65,pitch:.5 }),
  preset("child-girl-animated", "Child Girl — Animated", "Juvenil sintética", "Juvenil feminino • animada", "feminina", "juvenil", "shimmer", { style:"animada",speed:1.15,energy:.9,expressiveness:.92,roughness:.05,warmth:.5,brightness:.9,pitch:2 }),
  preset("child-girl-calm", "Child Girl — Calm", "Juvenil sintética", "Juvenil feminino • suave", "feminina", "juvenil", "shimmer", { style:"calma",speed:.93,energy:.35,expressiveness:.42,roughness:.02,warmth:.7,brightness:.75,pitch:1.5 }),
  preset("child-girl-grumpy", "Child Girl — Grumpy", "Juvenil sintética", "Juvenil feminino • brava", "feminina", "juvenil", "shimmer", { style:"brava",speed:1.08,energy:.85,expressiveness:.88,roughness:.28,warmth:.2,brightness:.72,pitch:1 }),
  ...(["Casual","Excited","Shy","Sarcastic","Serious"] as const).flatMap((m, i) => [
    preset(`teen-boy-${m.toLowerCase()}`, `Teen Boy — ${m}`, "Teen", `Teen masculino • ${m}`, "masculina", "teen", "echo", { style:(["natural","animada","calma","sarcastica","seria"] as VoiceStyle[])[i]!,speed:[1,1.14,.9,1.02,.94][i]!,energy:[.6,.92,.3,.62,.45][i]!,expressiveness:[.55,.9,.38,.75,.42][i]!,roughness:.12,warmth:.5,brightness:.66,pitch:.5 }),
    preset(`teen-girl-${m.toLowerCase()}`, `Teen Girl — ${m}`, "Teen", `Teen feminino • ${m}`, "feminina", "teen", "nova", { style:(["natural","animada","calma","sarcastica","seria"] as VoiceStyle[])[i]!,speed:[1,1.14,.9,1.02,.94][i]!,energy:[.6,.92,.3,.62,.45][i]!,expressiveness:[.55,.9,.38,.75,.42][i]!,roughness:.05,warmth:.55,brightness:.72,pitch:.5 }),
  ]),
  ...(["Casual","Friendly","Serious","Deep","Energetic","Nervous","Sarcastic","Angry","Boss"] as const).map((m, i) => preset(`adult-male-${m.toLowerCase()}`, `Adult Male — ${m}`, "Adulto masculino", `Adulto masculino • ${m}`, "masculina", "adulta", i===3||i===8?"onyx":"ash", { style:(["natural","natural","seria","seria","animada","nervosa","sarcastica","brava","autoritaria"] as VoiceStyle[])[i]!,speed:[1,1,.94,.88,1.12,1.06,1,.98,.9][i]!,energy:[.55,.6,.45,.4,.9,.65,.58,.92,.72][i]!,expressiveness:[.5,.62,.42,.38,.82,.75,.72,.88,.58][i]!,roughness:[.18,.12,.22,.38,.16,.25,.24,.45,.28][i]!,warmth:[.5,.72,.42,.48,.48,.35,.35,.22,.4][i]!,brightness:.42,pitch:i===3?-2:i===8?-1:0 })),
  ...(["Casual","Friendly","Serious","Energetic","Sarcastic","Angry","Boss","Warm"] as const).map((m, i) => preset(`adult-female-${m.toLowerCase()}`, `Adult Female — ${m}`, "Adulto feminino", `Adulto feminino • ${m}`, "feminina", "adulta", i===7?"sage":"nova", { style:(["natural","natural","seria","animada","sarcastica","brava","autoritaria","calma"] as VoiceStyle[])[i]!,speed:[1,1,.94,1.12,1,.98,.91,.94][i]!,energy:[.55,.62,.45,.9,.58,.9,.7,.42][i]!,expressiveness:[.5,.65,.42,.85,.74,.88,.56,.52][i]!,roughness:.08,warmth:[.55,.72,.48,.5,.35,.2,.42,.88][i]!,brightness:.62,pitch:0 })),
  ...[
    ["father-warm","Father — Warm","Pai • caloroso","masculina","adulta","onyx","calma",.94,.48,.58,.75],
    ["father-strict","Father — Strict","Pai • firme","masculina","adulta","onyx","autoritaria",.91,.68,.52,.38],
    ["father-funny","Father — Funny","Pai • divertido","masculina","adulta","ash","comedy",1.07,.78,.82,.66],
    ["mother-warm","Mother — Warm","Mãe • acolhedora","feminina","adulta","sage","calma",.94,.45,.58,.9],
    ["mother-strict","Mother — Strict","Mãe • firme","feminina","adulta","nova","autoritaria",.92,.7,.58,.42],
    ["mother-funny","Mother — Funny","Mãe • divertida","feminina","adulta","nova","comedy",1.07,.78,.84,.72],
    ["grandfather-calm","Grandfather — Calm","Avô • calmo","masculina","madura","onyx","calma",.82,.32,.4,.75],
    ["grandfather-grumpy","Grandfather — Grumpy","Avô • resmungão","masculina","madura","onyx","brava",.88,.58,.68,.35],
    ["grandfather-storyteller","Grandfather — Storyteller","Avô • contador de histórias","masculina","madura","onyx","dramatic",.86,.5,.78,.78],
    ["grandmother-warm","Grandmother — Warm","Avó • acolhedora","feminina","madura","sage","calma",.86,.38,.52,.92],
    ["grandmother-serious","Grandmother — Serious","Avó • séria","feminina","madura","sage","seria",.88,.48,.45,.62],
    ["grandmother-storyteller","Grandmother — Storyteller","Avó • contadora de histórias","feminina","madura","sage","dramatic",.86,.5,.78,.84],
  ].map((v) => preset(v[0] as string,v[1] as string,"Família",v[2] as string,v[3] as VoiceGender,v[4] as VoiceAge,v[5] as string,{style:v[6] as VoiceStyle,speed:v[7] as number,energy:v[8] as number,expressiveness:v[9] as number,roughness:.22,warmth:v[10] as number,brightness:.42,pitch:-.5})),
  ...[
    ["teacher-calm","Teacher — Calm","Professor • calmo","calma"], ["teacher-strict","Teacher — Strict","Professor • firme","autoritaria"],
    ["principal-boss","Principal / Boss — Authoritative","Diretor • autoridade","autoritaria"], ["employee-nervous","Employee — Nervous","Funcionário • nervoso","nervosa"],
    ["employee-casual","Employee — Casual","Funcionário • casual","natural"], ["friend-energetic","Friend — Energetic","Amigo • energético","animada"],
    ["friend-sarcastic","Friend — Sarcastic","Amigo • sarcástico","sarcastica"], ["neighbor-curious","Neighbor — Curious","Vizinho • curioso","assustada"],
    ["narrator-warm","Narrator — Warm","Narrador • acolhedor","calma"], ["narrator-dramatic","Narrator — Dramatic","Narrador • dramático","dramatic"],
    ["narrator-comedy","Narrator — Comedy","Narrador • comédia","comedy"],
  ].map((v,i) => preset(v[0]!,v[1]!,"Personagens",v[2]!,i%3===1?"feminina":"masculina","adulta",i%3===1?"nova":"ash",{style:v[3] as VoiceStyle,speed:v[3]==="nervosa"?1.08:.98,energy:v[3]==="animada"?.9:.58,expressiveness:v[3]==="dramatic"?.9:.65,roughness:.14,warmth:v[3]==="calma"?.82:.5,brightness:.52,pitch:0})),
];

export const VOICE_STYLES: { id: VoiceStyle; label: string; direction: string }[] = [
  { id:"natural",label:"Natural",direction:"Fale em português do Brasil, em tom natural de conversa." },
  { id:"animada",label:"Animada",direction:"Fale em português do Brasil, com energia e ritmo vivo." },
  { id:"calma",label:"Calma",direction:"Fale em português do Brasil, com calma, pausas naturais e voz acolhedora." },
  { id:"seria",label:"Séria",direction:"Fale em português do Brasil, em tom sério e contido." },
  { id:"sussurro",label:"Sussurro",direction:"Fale em português do Brasil, baixinho, como um segredo." },
  { id:"nervosa",label:"Nervosa",direction:"Fale em português do Brasil, com tensão e respiração curta." },
  { id:"sarcastica",label:"Sarcástica",direction:"Fale em português do Brasil, com ironia leve." },
  { id:"assustada",label:"Assustada",direction:"Fale em português do Brasil, surpresa e urgente." },
  { id:"brava",label:"Brava",direction:"Fale em português do Brasil, irritada e teatral, sem gritar." },
  { id:"autoritaria",label:"Autoritária",direction:"Fale em português do Brasil, firme, segura e com ritmo controlado." },
  { id:"dramatic",label:"Dramática",direction:"Fale em português do Brasil, com pausas e intensidade narrativa." },
  { id:"comedy",label:"Cômica",direction:"Fale em português do Brasil, com timing cômico e expressão estilizada." },
];

/** Atalhos mostrados primeiro no Voice Cast; todos são identidades sintéticas genéricas. */
export const FEATURED_ACTING_PRESET_IDS = [
  "adult-male-boss",
  "adult-male-casual",
  "adult-male-friendly",
  "child-boy-animated",
  "child-boy-calm",
  "teen-boy-casual",
  "teen-boy-excited",
  "teen-boy-serious",
] as const;

const FEATURED_VOICE_LABELS: Record<string, string> = {
  "adult-male-boss": "Adulto chefe",
  "adult-male-casual": "Adulto 1 — natural",
  "adult-male-friendly": "Adulto 2 — amigável",
  "child-boy-animated": "Criança masculina 1 — animada",
  "child-boy-calm": "Criança masculina 2 — suave",
  "teen-boy-casual": "Adolescente 1 — natural",
  "teen-boy-excited": "Adolescente 2 — animado",
  "teen-boy-serious": "Adolescente 3 — sério",
};

export function voiceDisplayLabel(preset: VoicePreset): string {
  return FEATURED_VOICE_LABELS[preset.id] ?? preset.label;
}

export const DEFAULT_VOICE: VoiceProfile = { presetId:"adult-female-casual",provider:"lovable-ai",providerVoiceId:"nova",language:"pt",locale:"pt-BR",ageStyle:"adulta",genderStyle:"feminina",style:"natural",speed:1,gain:1,pitch:0,energy:.55,expressiveness:.5,roughness:.08,warmth:.55,brightness:.62 };
export const DEFAULT_MESSAGE_VOICE_DIRECTION: MessageVoiceDirection = { emotion:"neutral",speedMultiplier:1,energyMultiplier:1,pauseBeforeMs:0,pauseAfterMs:0 };

export function voicePreset(id: string | undefined): VoicePreset { return VOICE_PRESETS.find(v=>v.id===id) ?? VOICE_PRESETS.find(v=>v.id==="adult-female-casual") ?? VOICE_PRESETS[0]!; }
export function profileFromPreset(id: string, base: Partial<VoiceProfile> = {}): VoiceProfile {
  const p=voicePreset(id);
  const styles: Record<string, string> = { "faber-viral": "adam_roblox_teen", "faber-natural": "adam_natural", "faber-young": "adam_young", "faber-child": "adam_child_male", "faber-deep": "adam_deep", "faber-mature": "adam_mature_character", "faber-high": "adam_child_pitch_only" };
  return { ...DEFAULT_VOICE,...p.profile,...base,presetId:p.id,provider:p.provider??base.provider??DEFAULT_VOICE.provider??"lovable-ai",providerVoiceId:base.providerVoiceId??p.providerVoice,ageStyle:p.age,genderStyle:p.gender,name:base.name??voiceDisplayLabel(p), ...(styles[p.id] ? { transform: selectionFromTransformPreset(styles[p.id]!) } : {}) };
}
export interface VoiceTimbre { expressiveness?: number; roughness?: number; warmth?: number; brightness?: number; }

/** Descreve o timbre em palavras, já que o provedor só aceita instrução em texto. */
export function timbreDirection(timbre: VoiceTimbre | undefined): string {
  if (!timbre) return "";
  const parts: string[] = [];
  const { expressiveness: ex, roughness: ro, warmth: wa, brightness: br } = timbre;
  if (ex !== undefined) parts.push(ex <= .3 ? "pouca variação de entonação" : ex >= .7 ? "entonação muito expressiva" : "entonação moderada");
  if (wa !== undefined) parts.push(wa <= .3 ? "timbre seco e distante" : wa >= .7 ? "timbre quente e acolhedor" : "timbre equilibrado");
  if (br !== undefined) parts.push(br <= .3 ? "voz abafada e grave" : br >= .7 ? "voz clara e brilhante" : "voz de brilho médio");
  if (ro !== undefined && ro >= .35) parts.push(ro >= .7 ? "voz bem rouca" : "leve aspereza na voz");
  return parts.length ? ` Timbre: ${parts.join(", ")}.` : "";
}

export function voiceDirection(style: VoiceStyle | undefined, emotion: VoiceEmotion = "neutral", energy?: number, age?: string, gender?: string, timbre?: VoiceTimbre): string {
  const base=(VOICE_STYLES.find(s=>s.id===style)??VOICE_STYLES[0]!).direction;
  const emotionMap: Record<VoiceEmotion,string>={neutral:"",happy:" Soe feliz.",excited:" Soe empolgada.",serious:" Soe séria.",nervous:" Soe nervosa.",annoyed:" Soe incomodada.","angry-theatrical":" Soe brava de forma teatral, sem gritar.",sad:" Soe triste e contida.",sarcastic:" Use ironia leve.",surprised:" Soe surpresa.","whisper-like":" Fale como um segredo, sem perder clareza."};
  const energyText = energy === undefined ? "" : energy <= .3 ? " Volume baixo e intensidade contida." : energy >= .7 ? " Bastante energia e projeção." : " Intensidade média, sem exagero.";
  const castText = age || gender ? ` Personagem sintético: ${[age, gender].filter(Boolean).join(", ")}.` : "";
  const ageText = age === "juvenil" ? " Mantenha uma interpretação juvenil natural e moderada, sem caricatura, falsete extremo ou efeito de esquilo." : "";
  // sotaque brasileiro é obrigatório: nunca deixar a voz cair para português europeu
  return `Você é um ator brasileiro de dublagem gravando esta fala. Fale em português do Brasil (pt-BR) como falante nativo: entonação e vogais abertas do Brasil, nunca sotaque de Portugal nem estrangeiro. Interprete o personagem, não leia o texto: respiração natural, micro-pausas variadas pela pontuação, variação de altura e velocidade dentro da frase, finais de frase naturais, zero tom robótico ou de locutor. ${base}${emotionMap[emotion]}${energyText}${castText}${ageText}${timbreDirection(timbre)}`.trim();
}

export interface VoiceMixSettings { enabled:boolean; ducking:boolean; normalize:boolean; musicUrl?:string|null; musicGain:number; duckingAmount?:number; duckingAttackMs?:number; duckingReleaseMs?:number; }
export const DEFAULT_VOICE_MIX: VoiceMixSettings = { enabled:false,ducking:true,normalize:true,musicUrl:null,musicGain:.25,duckingAmount:.78,duckingAttackMs:180,duckingReleaseMs:240 };

export function voiceKey(text:string, profile:VoiceProfile, direction?:Partial<MessageVoiceDirection>):string {
  const preset = voicePreset(profile.presetId);
  // v4 adds the complete post-processing configuration to cache identity.
  const raw=JSON.stringify({v:"ator-br-transform-1",text:text.trim(),provider:profile.provider??"lovable-ai",voice:profile.providerVoiceId??preset.providerVoice,preset:profile.presetId,locale:profile.locale??"pt-BR",age:profile.ageStyle??preset.age,gender:profile.genderStyle??preset.gender,style:profile.style,speed:Number(profile.speed.toFixed(3)),pitch:profile.pitch??0,energy:profile.energy??.5,expression:profile.expressiveness??.5,roughness:profile.roughness??0,warmth:profile.warmth??.5,brightness:profile.brightness??.5,emotion:direction?.emotion??"neutral",speedMultiplier:direction?.speedMultiplier??1,energyMultiplier:direction?.energyMultiplier??1,settings:profile.providerSettings??{},transform:profile.transform??null});
  const identity = raw + JSON.stringify(profile.reference ?? null);
  let h1=2166136261,h2=5381; for(let i=0;i<identity.length;i++){h1=Math.imul(h1^identity.charCodeAt(i),16777619)>>>0;h2=((h2<<5)+h2+identity.charCodeAt(i))>>>0;} return `${h1.toString(36)}${h2.toString(36)}`;
}
export function speakableText(kind:string,text:string):string { if(kind==="system"||kind==="sticker"||kind==="card")return ""; return text.replace(/\s+/g," ").trim(); }
