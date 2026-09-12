/**
 * Marca do criador no ChatScene.
 *
 * Reúne a marca por cima da cena (logo + @) e o cabeçalho do vídeo, que deixa
 * de ser fixo: estilo, título, subtítulo, logo, imagem de fundo e cores.
 */
import { Loader2, Upload } from "lucide-react";
import {
  DEFAULT_BRANDING,
  DEFAULT_HEADER,
  HEADER_STYLES,
  type ChatSceneHeader,
  type ChatSceneProject,
} from "@/lib/chatscene/types";

export interface BrandPanelProps {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
  uploading: string | null;
  onLogo: (file: File) => void;
  onHeaderLogo: (file: File) => void;
  onHeaderBackground: (file: File) => void;
}

const inputClass =
  "w-full rounded-md border border-border bg-background/60 px-2 py-1 text-xs outline-none focus:border-primary";

export function BrandPanel({
  project,
  patch,
  uploading,
  onLogo,
  onHeaderLogo,
  onHeaderBackground,
}: BrandPanelProps) {
  const header: ChatSceneHeader = { ...DEFAULT_HEADER, ...project.header };
  const setHeader = (changes: Partial<ChatSceneHeader>) => patch({ header: { ...header, ...changes } });

  return (
    <div>
      <p className="mono-label mb-1.5 text-muted-foreground">Cabeçalho do vídeo</p>
      <div className="grid grid-cols-2 gap-1.5">
        {HEADER_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            title={s.hint}
            onClick={() => setHeader({ style: s.id })}
            className={`rounded-lg border px-2 py-1.5 text-xs transition ${
              header.style === s.id
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {header.style !== "none" && (
        <div className="mt-2 space-y-1.5">
          <input
            value={header.title ?? ""}
            onChange={(e) => setHeader({ title: e.target.value || null })}
            placeholder="título (vazio = nome da conversa)"
            className={inputClass}
            aria-label="Título do cabeçalho"
          />
          <input
            value={header.subtitle ?? ""}
            onChange={(e) => setHeader({ subtitle: e.target.value })}
            placeholder="texto pequeno (ex.: online, @seucanal)"
            className={inputClass}
            aria-label="Texto pequeno do cabeçalho"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs hover:border-primary">
              {uploading === "header-logo" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Logo do topo
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onHeaderLogo(file);
                }}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs hover:border-primary">
              {uploading === "header-bg" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Imagem de fundo
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onHeaderBackground(file);
                }}
              />
            </label>
            {(header.logoUrl || header.bgImageUrl) && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline hover:text-primary"
                onClick={() => setHeader({ logoUrl: null, bgImageUrl: null })}
              >
                tirar imagens
              </button>
            )}
          </div>

          <input
            value={header.bgImageUrl ?? ""}
            onChange={(e) => setHeader({ bgImageUrl: e.target.value || null })}
            placeholder="ou endereço da imagem de fundo do topo"
            className={inputClass}
            aria-label="Endereço da imagem de fundo do cabeçalho"
          />

          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              cor do topo
              <input
                type="color"
                value={header.bgColor ?? "#111827"}
                onChange={(e) => setHeader({ bgColor: e.target.value })}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
                aria-label="Cor do cabeçalho"
              />
            </label>
            <label className="flex items-center gap-1.5">
              cor do texto
              <input
                type="color"
                value={header.textColor ?? "#ffffff"}
                onChange={(e) => setHeader({ textColor: e.target.value })}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent"
                aria-label="Cor do texto do cabeçalho"
              />
            </label>
            {(header.bgColor || header.textColor) && (
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline hover:text-primary"
                onClick={() => setHeader({ bgColor: null, textColor: null })}
              >
                usar as cores do tema
              </button>
            )}
          </div>
        </div>
      )}

      <hr className="my-3 border-border" />

      <p className="mono-label mb-1.5 text-muted-foreground">Sua marca na tela</p>
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          checked={project.branding?.enabled ?? false}
          onChange={(e) =>
            patch({ branding: { ...DEFAULT_BRANDING, ...project.branding, enabled: e.target.checked } })
          }
        />
        mostrar meu @ e logo no vídeo
      </label>
      {project.branding?.enabled && (
        <div className="mt-1.5 space-y-1.5">
          <input
            value={project.branding.handle}
            onChange={(e) =>
              patch({ branding: { ...DEFAULT_BRANDING, ...project.branding, handle: e.target.value } })
            }
            placeholder="@seuperfil"
            className={inputClass}
            aria-label="Seu @"
          />
          <div className="flex items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background/60 px-2 py-1 text-xs hover:border-primary">
              {uploading === "logo" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Logo
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onLogo(file);
                }}
              />
            </label>
            <select
              value={project.branding.position}
              onChange={(e) =>
                patch({
                  branding: {
                    ...DEFAULT_BRANDING,
                    ...project.branding,
                    position: e.target.value as NonNullable<ChatSceneProject["branding"]>["position"],
                  },
                })
              }
              className="flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-xs"
              aria-label="Posição da marca"
            >
              <option value="bottom-right">canto inferior direito</option>
              <option value="bottom-left">canto inferior esquerdo</option>
              <option value="top-right">canto superior direito</option>
              <option value="top-left">canto superior esquerdo</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
