import {
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Music2,
  Plus,
  Search,
  Camera,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Home,
  Compass,
  Clapperboard,
  User,
} from "lucide-react";

export type PlatformUI = "tiktok" | "instagram" | "shorts";

export const PLATFORM_UI_OPTIONS: { value: PlatformUI | "off"; label: string }[] = [
  { value: "off", label: "grade UI: desligada" },
  { value: "tiktok", label: "grade UI: TikTok" },
  { value: "instagram", label: "grade UI: Instagram" },
  { value: "shorts", label: "grade UI: Shorts" },
];

const ICON = "size-[7%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]";
const TXT = "drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]";

/** moldura de telefone para destacar a área coberta pela interface do app */
function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 select-none text-white">
      {children}
      <span className="absolute top-1 left-1 rounded bg-black/70 px-1 font-mono text-[9px] text-warn">
        UI do app · {label}
      </span>
    </div>
  );
}

function TikTokUI() {
  return (
    <Frame label="TikTok">
      {/* topo: abas + busca */}
      <div className="absolute inset-x-0 top-[2.5%] flex items-center justify-center gap-[4%] text-[10px] font-semibold">
        <span className={`opacity-60 ${TXT}`}>Seguindo</span>
        <span className={`border-b-2 border-white pb-0.5 ${TXT}`}>Para você</span>
        <Search className={`absolute right-[4%] size-[5.5%] ${TXT}`} />
      </div>
      {/* coluna de ações (direita) */}
      <div className="absolute right-[3%] bottom-[16%] flex w-[12%] flex-col items-center gap-[10%]">
        <div className="relative mb-[8%]">
          <div className="grid aspect-square w-[80%] place-items-center rounded-full border-2 border-white bg-gradient-to-br from-fuchsia-400 to-cyan-400 text-[9px] font-bold">
            VV
          </div>
          <Plus className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-red-500 p-0.5" />
        </div>
        {[Heart, MessageCircle, Bookmark, Share2].map((Icon, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <Icon className={ICON} fill={i === 0 ? "currentColor" : "none"} />
            <span className={`text-[7px] ${TXT}`}>{["128k", "1.024", "9.4k", "compart."][i]}</span>
          </div>
        ))}
        <div className="mt-[6%] grid aspect-square w-[70%] animate-[spin_6s_linear_infinite] place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 ring-2 ring-zinc-500/60">
          <Music2 className="size-1/2" />
        </div>
      </div>
      {/* rodapé: autor + legenda + música */}
      <div className="absolute bottom-[11.5%] left-[3%] max-w-[72%] space-y-[1.5%]">
        <p className={`text-[10px] font-bold ${TXT}`}>@seuperfil</p>
        <p className={`text-[8px] leading-snug opacity-90 ${TXT}`}>
          sua legenda aparece aqui… #viral #fyp
        </p>
        <p className={`flex items-center gap-1 text-[8px] opacity-90 ${TXT}`}>
          <Music2 className="size-2.5" /> som original — seuperfil
        </p>
      </div>
      {/* barra de navegação inferior */}
      <div className="absolute inset-x-0 bottom-0 flex h-[9%] items-center justify-around border-t border-white/10 bg-black/40">
        {[Home, Compass, Plus, Clapperboard, User].map((Icon, i) => (
          <Icon key={i} className="h-[45%] w-auto opacity-80" />
        ))}
      </div>
    </Frame>
  );
}

function InstagramUI() {
  return (
    <Frame label="Instagram">
      {/* topo */}
      <div className="absolute inset-x-0 top-[2.5%] flex items-center justify-between px-[4%]">
        <span className={`text-[11px] font-bold ${TXT}`}>Reels</span>
        <Camera className={`size-[5.5%] ${TXT}`} />
      </div>
      {/* coluna de ações (direita) */}
      <div className="absolute right-[3%] bottom-[19%] flex w-[12%] flex-col items-center gap-[14%]">
        {[Heart, MessageCircle, Share2, Bookmark].map((Icon, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <Icon className={ICON} />
            {i < 3 && (
              <span className={`text-[7px] ${TXT}`}>{["45,2 mil", "812", ""][i]}</span>
            )}
          </div>
        ))}
        <MoreHorizontal className={ICON} />
      </div>
      {/* rodapé */}
      <div className="absolute bottom-[3%] left-[3%] max-w-[74%] space-y-[2%]">
        <div className="flex items-center gap-1.5">
          <div className="grid size-[5.5%] aspect-square place-items-center rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-[7px] font-bold">
            VV
          </div>
          <span className={`text-[9px] font-semibold ${TXT}`}>seuperfil</span>
          <span className={`rounded border border-white/70 px-1 text-[7px] ${TXT}`}>Seguir</span>
        </div>
        <p className={`text-[8px] leading-snug opacity-90 ${TXT}`}>sua legenda aparece aqui…</p>
        <p className={`flex items-center gap-1 text-[7.5px] opacity-90 ${TXT}`}>
          <Music2 className="size-2.5" /> seuperfil · Áudio original
        </p>
      </div>
    </Frame>
  );
}

function ShortsUI() {
  return (
    <Frame label="YouTube Shorts">
      {/* topo */}
      <div className="absolute inset-x-0 top-[2.5%] flex items-center justify-between px-[4%]">
        <span className={`text-[10px] font-bold ${TXT}`}>Shorts</span>
        <div className="flex gap-[8%]">
          <Search className={`size-[5%] ${TXT}`} />
          <Camera className={`size-[5%] ${TXT}`} />
        </div>
      </div>
      {/* coluna de ações (direita) */}
      <div className="absolute right-[3%] bottom-[20%] flex w-[14%] flex-col items-center gap-[12%]">
        {[
          { Icon: ThumbsUp, label: "12 mil" },
          { Icon: ThumbsDown, label: "" },
          { Icon: MessageCircle, label: "356" },
          { Icon: Share2, label: "Compart." },
        ].map(({ Icon, label }, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <div className="grid aspect-square w-[85%] place-items-center rounded-full bg-black/45">
              <Icon className="size-1/2" />
            </div>
            {label && <span className={`text-[7px] ${TXT}`}>{label}</span>}
          </div>
        ))}
      </div>
      {/* rodapé */}
      <div className="absolute bottom-[2.5%] left-[3%] max-w-[72%] space-y-[2%]">
        <div className="flex items-center gap-1.5">
          <div className="grid aspect-square size-[6%] place-items-center rounded-full bg-red-600 text-[7px] font-bold">
            VV
          </div>
          <span className={`text-[9px] font-semibold ${TXT}`}>@seucanal</span>
          <span className={`rounded-full bg-white px-1.5 py-px text-[7px] font-semibold text-black`}>
            Inscrever-se
          </span>
        </div>
        <p className={`text-[8px] leading-snug opacity-90 ${TXT}`}>título do seu short aparece aqui</p>
      </div>
    </Frame>
  );
}

/**
 * Sobreposição (somente prévia) que simula a interface do app sobre o vídeo,
 * para o usuário posicionar legenda/branding fora das áreas cobertas.
 */
export function PlatformUIOverlay({ platform }: { platform: PlatformUI }) {
  if (platform === "tiktok") return <TikTokUI />;
  if (platform === "instagram") return <InstagramUI />;
  return <ShortsUI />;
}
