/**
 * Tela de temas do ChatScene — só apresentação.
 *
 * Escolha de tema base, claro/escuro, fonte, arredondamento e cores livres.
 * Nada aqui mexe em tempo, mensagens ou render: apenas em `themeOverrides`.
 */
import { RotateCcw } from "lucide-react";

import type { ChatSceneProject } from "@/lib/chatscene/types";
import {
  CHAT_THEMES,
  THEME_COLOR_FIELDS,
  THEME_FONTS,
  resolveTheme,
  type ThemeOverrides,
} from "@/lib/chatscene/theme";

interface Props {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
}

function hexOf(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}

export function ThemePanel({ project, patch }: Props) {
  const overrides: ThemeOverrides = project.themeOverrides ?? {};
  const theme = resolveTheme(project.themeId, project.dark, overrides);
  const set = (changes: ThemeOverrides) => patch({ themeOverrides: { ...overrides, ...changes } });
  const custom = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="mono-label text-muted-foreground">Tema da conversa</p>
        {custom && (
          <button
            type="button"
            onClick={() => patch({ themeOverrides: {} })}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> voltar ao original
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {CHAT_THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => patch({ themeId: t.id })}
            title={t.description}
            className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${
              project.themeId === t.id
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            <span className="font-medium">{t.label}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{t.description}</span>
          </button>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={project.dark}
          onChange={(e) => patch({ dark: e.target.checked })}
        />
        modo escuro
      </label>

      {/* amostra rápida do resultado */}
      <div
        className="space-y-2 rounded-lg border border-border p-3"
        style={{ background: theme.wallpaper, fontFamily: theme.fontFamily }}
      >
        <div
          className="max-w-[80%] px-3 py-2 text-xs"
          style={{
            background: theme.peerBubble,
            color: theme.peerText,
            borderRadius: `${Math.round(theme.radius * 40)}px`,
          }}
        >
          Oi, viu o que aconteceu?
        </div>
        <div
          className="ml-auto max-w-[80%] px-3 py-2 text-xs"
          style={{
            background: theme.selfBubble,
            color: theme.selfText,
            borderRadius: `${Math.round(theme.radius * 40)}px`,
          }}
        >
          Conta tudo agora 👀
        </div>
      </div>

      <div className="space-y-2">
        <p className="mono-label text-muted-foreground">Fonte</p>
        <select
          value={THEME_FONTS.find((f) => f.value === theme.fontFamily)?.id ?? "custom"}
          onChange={(e) => {
            const font = THEME_FONTS.find((f) => f.id === e.target.value);
            if (font) set({ fontFamily: font.value });
          }}
          className="w-full rounded-md border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary"
        >
          {!THEME_FONTS.some((f) => f.value === theme.fontFamily) && (
            <option value="custom">Do tema</option>
          )}
          {THEME_FONTS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Cantos do balão</span>
          <span className="mono-label">{Math.round(theme.radius * 100)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={0.7}
          step={0.02}
          value={theme.radius}
          onChange={(e) => set({ radius: Number(e.target.value) })}
          className="w-full"
        />
      </div>

      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={theme.tail}
          onChange={(e) => set({ tail: e.target.checked })}
        />
        balão com rabinho
      </label>

      <div className="space-y-2">
        <p className="mono-label text-muted-foreground">Cores</p>
        <div className="grid grid-cols-2 gap-2">
          {THEME_COLOR_FIELDS.map((field) => {
            const value = String(theme[field.key as keyof typeof theme] ?? "#000000");
            return (
              <label key={field.key} className="flex items-center gap-2 text-[11px]">
                <input
                  type="color"
                  aria-label={field.label}
                  value={hexOf(value)}
                  onChange={(e) => set({ [field.key]: e.target.value } as ThemeOverrides)}
                  className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                />
                <span className="truncate text-muted-foreground">{field.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
