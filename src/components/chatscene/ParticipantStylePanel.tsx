/**
 * Estilo por personagem: cor do balão, cor e fonte do texto, negrito, itálico
 * e tamanho. Só apresentação — escreve direto no ChatSceneProject (participants),
 * sem criar estado paralelo.
 */
import { Type } from "lucide-react";
import { PARTICIPANT_FONTS, type ChatSceneProject, type ParticipantStyle } from "@/lib/chatscene/types";

export interface ParticipantStylePanelProps {
  project: ChatSceneProject;
  patch: (changes: Partial<ChatSceneProject>) => void;
}

const QUICK_COLORS = ["#7c5cff", "#25d366", "#ff4d6d", "#1fb6ff", "#ffb703", "#111827", "#f8fafc", "#8b5cf6"];

export function ParticipantStylePanel({ project, patch }: ParticipantStylePanelProps) {
  const setStyle = (id: string, changes: Partial<ParticipantStyle>) =>
    patch({
      participants: project.participants.map((p) =>
        p.id === id ? { ...p, style: { ...(p.style ?? {}), ...changes } } : p,
      ),
    });

  return (
    <section aria-label="Estilo por personagem">
      <p className="mono-label mb-2 flex items-center gap-1.5 text-muted-foreground">
        <Type className="size-3.5" />
        Estilo de cada personagem
      </p>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Deixe cada pessoa com a cara dela: cor do balão, cor e fonte do texto, tamanho e destaque.
      </p>

      <div className="flex flex-col gap-2">
        {project.participants.map((p) => {
          const st = p.style ?? {};
          return (
            <div key={p.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-medium">
                  <span className="size-3 rounded-full" style={{ background: p.color }} aria-hidden />
                  {p.name}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground underline hover:text-foreground"
                  onClick={() =>
                    patch({
                      participants: project.participants.map((x) =>
                        x.id === p.id ? { ...x, style: {} } : x,
                      ),
                    })
                  }
                >
                  voltar ao tema
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-muted-foreground">Cor do balão</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={st.bubbleColor || "#1f2937"}
                      onChange={(e) => setStyle(p.id, { bubbleColor: e.target.value })}
                      className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={`Cor do balão de ${p.name}`}
                    />
                    {QUICK_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`Usar ${c} no balão de ${p.name}`}
                        aria-pressed={st.bubbleColor === c}
                        onClick={() => setStyle(p.id, { bubbleColor: c })}
                        className={`size-4 rounded-full border ${
                          st.bubbleColor === c ? "border-primary" : "border-border"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                </label>

                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-muted-foreground">Cor do texto</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={st.textColor || "#ffffff"}
                      onChange={(e) => setStyle(p.id, { textColor: e.target.value })}
                      className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={`Cor do texto de ${p.name}`}
                    />
                    <input
                      value={st.textColor ?? ""}
                      placeholder="#ffffff"
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") setStyle(p.id, { textColor: v || null });
                      }}
                      className="w-20 rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] outline-none"
                      aria-label={`Código da cor do texto de ${p.name}`}
                    />
                  </span>
                </label>

                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-muted-foreground">Fonte</span>
                  <select
                    value={st.fontFamily ?? ""}
                    onChange={(e) => setStyle(p.id, { fontFamily: e.target.value || null })}
                    className="rounded border border-border bg-background/60 px-1.5 py-1 text-xs outline-none"
                  >
                    {PARTICIPANT_FONTS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[11px]">
                  <span className="text-muted-foreground">
                    Tamanho do texto · {(st.fontScale ?? 1).toFixed(2)}×
                  </span>
                  <input
                    type="range"
                    min={0.8}
                    max={1.3}
                    step={0.05}
                    value={st.fontScale ?? 1}
                    onChange={(e) => setStyle(p.id, { fontScale: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="mt-2 flex items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!st.bold}
                    onChange={(e) => setStyle(p.id, { bold: e.target.checked })}
                  />
                  Negrito
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!st.italic}
                    onChange={(e) => setStyle(p.id, { italic: e.target.checked })}
                  />
                  Itálico
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
