import { Check, MessageCircle, BookOpen, ArrowUpRight } from "lucide-react";
import type { CreatorFormat } from "@/lib/chatscene/creator-presets";

export function CreatorFormatPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CreatorFormat;
  onChange: (value: CreatorFormat) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2" role="group" aria-label="Formato do vídeo">
      {(["whatsapp", "reddit"] as const).map((format) => {
        const active = value === format;
        const chat = format === "whatsapp";
        const Icon = chat ? MessageCircle : BookOpen;
        return (
          <button
            key={format}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(format)}
            className={`group relative flex min-h-32 items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${active ? "border-primary bg-primary/10 shadow-[0_4px_24px_-16px_var(--primary)]" : "border-border bg-card hover:border-primary/50 hover:bg-secondary/50"}`}
          >
            <span
              aria-hidden="true"
              className={`relative flex h-24 w-20 shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl p-2.5 ${chat ? "bg-[#102821]" : "bg-[#332119]"}`}
            >
              {chat ? (
                <>
                  <span className="flex items-center gap-1 text-[8px] font-semibold text-white">
                    <span className="size-3 rounded-full bg-emerald-400/70" /> Conversa
                  </span>
                  <span className="mr-2 rounded-md bg-[#263d35] p-1.5 text-[7px] leading-snug text-white">
                    Você não vai acreditar
                  </span>
                  <span className="ml-3 rounded-md bg-[#087f5b] p-1.5 text-[7px] text-white">
                    O que foi?
                  </span>
                  <span className="mr-1 h-3 rounded bg-[#263d35]" />
                </>
              ) : (
                <>
                  <span className="text-[8px] font-bold text-orange-300">HISTÓRIA</span>
                  <span className="rounded-lg bg-white p-1.5 text-[7px] font-bold leading-snug text-slate-900">
                    Tudo mudou com uma mensagem.
                  </span>
                  <span className="mt-1 h-1 rounded bg-orange-300/80" />
                  <span className="h-1 w-8 rounded bg-white/40" />
                </>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Icon className={`size-4 ${chat ? "text-emerald-400" : "text-orange-300"}`} />
                {chat ? "CONVERSA ENCENADA" : "RELATO NARRADO"}
              </span>
              <span className="block text-lg font-bold tracking-tight text-foreground">
                {chat ? "Fake WhatsApp" : "História do Reddit"}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {chat
                  ? "Personagens, mensagens e vozes diferentes."
                  : "Um narrador, um relato e texto em destaque."}
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {active ? <Check className="size-3" /> : <ArrowUpRight className="size-3.5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
