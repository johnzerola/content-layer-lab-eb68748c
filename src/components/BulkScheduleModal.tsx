import { useMemo, useRef, useState } from "react";
import { CalendarClock, FolderOpen, Image as ImageIcon, Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  buildSchedulePlan,
  daySlots,
  groupPlanByDay,
  mediaTypeOf,
  sortByName,
  type SlotMode,
} from "@/lib/schedule-plan";
import { KIND_LABEL, schedulePost, uploadPostMedia, type PostKind, type SocialAccount } from "@/lib/social";

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: SocialAccount[];
  onDone: () => void;
  /** Arquivos já prontos (ex.: saída do ViralBatch / CorteIA). */
  initialFiles?: File[];
};

const WEEKDAYS = [
  { value: 0, label: "D" },
  { value: 1, label: "S" },
  { value: 2, label: "T" },
  { value: 3, label: "Q" },
  { value: 4, label: "Q" },
  { value: 5, label: "S" },
  { value: 6, label: "S" },
];

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Agendamento em massa: pasta inteira dividida em X posts por dia. */
export function BulkScheduleModal({ open, onClose, accounts, onDone, initialFiles }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [kind, setKind] = useState<PostKind>("reels");
  const [caption, setCaption] = useState("");
  const [perDay, setPerDay] = useState(3);
  const [mode, setMode] = useState<SlotMode>("auto");
  const [times, setTimes] = useState("09:00, 13:00, 19:00");
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("21:00");
  const [startDate, setStartDate] = useState(todayInput());
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const ordered = useMemo(() => sortByName(files), [files]);

  const config = useMemo(() => {
    const [y, m, d] = startDate.split("-").map(Number);
    const start = new Date(y || 2026, (m || 1) - 1, d || 1);
    return {
      start,
      perDay,
      mode,
      times: times.split(",").map((t) => t.trim()).filter(Boolean),
      windowStart,
      windowEnd,
      weekdays,
    };
  }, [startDate, perDay, mode, times, windowStart, windowEnd, weekdays]);

  const plan = useMemo(() => buildSchedulePlan(ordered.length, config), [ordered.length, config]);
  const days = useMemo(() => groupPlanByDay(plan), [plan]);
  const slots = useMemo(() => daySlots(config), [config]);

  if (!open) return null;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = [...list].filter((f) => f.type.startsWith("video/") || f.type.startsWith("image/"));
    if (incoming.length === 0) {
      toast.error("Selecione fotos ou vídeos.");
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  };

  const run = async () => {
    if (!accountId) return toast.error("Selecione uma conta conectada.");
    if (ordered.length === 0) return toast.error("Adicione arquivos para agendar.");
    if (!consent) return toast.error("Confirme o consentimento de publicação.");

    setBusy(true);
    setProgress({ done: 0, total: ordered.length });
    let ok = 0;
    const failed: string[] = [];

    for (let i = 0; i < ordered.length; i++) {
      const file = ordered[i] as File;
      const when = plan[i];
      if (!when) break;
      try {
        const media = mediaTypeOf(file);
        const uploaded = await uploadPostMedia(file, file.name);
        await schedulePost({
          accountId,
          kind: media === "image" && kind === "reels" ? "feed" : kind,
          caption,
          scheduledAt: when,
          videoPath: uploaded.path,
          videoUrl: uploaded.url,
          fileName: file.name,
          mediaType: media,
          consent: true,
        });
        ok++;
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : "erro"}`);
      }
      setProgress({ done: i + 1, total: ordered.length });
    }

    setBusy(false);
    if (ok > 0) toast.success(`${ok} publicação(ões) agendada(s) em ${days.length} dia(s).`);
    if (failed.length > 0) toast.error(`${failed.length} falharam. ${failed[0] ?? ""}`);
    if (ok > 0) {
      setFiles([]);
      onDone();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 sm:p-6">
      <div className="panel flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden p-0">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="size-4 text-primary" />
              Agendamento em massa
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              suba a pasta inteira e o sistema divide por dia automaticamente
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-surface-2" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </header>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1.1fr_1fr]">
          {/* Coluna de configuração */}
          <div className="space-y-4">
            <div>
              <p className="mono-label">1. arquivos ({ordered.length})</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  Selecionar arquivos
                </Button>
                <Button variant="outline" size="sm" onClick={() => folderRef.current?.click()}>
                  <FolderOpen className="mr-1 size-4" />
                  Selecionar pasta
                </Button>
                {ordered.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                    Limpar
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="video/*,image/*"
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
              <input
                ref={folderRef}
                type="file"
                multiple
                hidden
                // @ts-expect-error atributo não tipado
                webkitdirectory=""
                onChange={(e) => addFiles(e.target.files)}
              />
              {ordered.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
                  {ordered.slice(0, 60).map((f, i) => (
                    <p key={`${f.name}-${i}`} className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                      {mediaTypeOf(f) === "image" ? (
                        <ImageIcon className="size-3 shrink-0 text-primary" />
                      ) : (
                        <Video className="size-3 shrink-0 text-primary" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </p>
                  ))}
                  {ordered.length > 60 && (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">+{ordered.length - 60} arquivo(s)</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mono-label">conta</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Selecione…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username} · {a.platform}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mono-label">formato</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as PostKind)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {(Object.keys(KIND_LABEL) as PostKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mono-label">legenda padrão</span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={2}
                placeholder="Usada em todas as publicações do lote"
                className="mt-1 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mono-label">publicações por dia</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={perDay}
                  onChange={(e) => setPerDay(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mono-label">começar em</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>

            <div>
              <p className="mono-label">horários</p>
              <div className="mt-2 flex gap-2">
                {(["auto", "fixed"] as SlotMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] ${
                      mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {m === "auto" ? "automático" : "fixos"}
                  </button>
                ))}
              </div>
              {mode === "auto" ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="time"
                    value={windowStart}
                    onChange={(e) => setWindowStart(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs outline-none focus:border-primary"
                  />
                  <span className="font-mono text-xs text-muted-foreground">até</span>
                  <input
                    type="time"
                    value={windowEnd}
                    onChange={(e) => setWindowEnd(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs outline-none focus:border-primary"
                  />
                </div>
              ) : (
                <input
                  value={times}
                  onChange={(e) => setTimes(e.target.value)}
                  placeholder="09:00, 13:00, 19:00"
                  className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-primary"
                />
              )}
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">slots do dia: {slots.join(" · ")}</p>
            </div>

            <div>
              <p className="mono-label">dias da semana (vazio = todos)</p>
              <div className="mt-2 flex gap-1.5">
                {WEEKDAYS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setWeekdays((prev) =>
                        prev.includes(d.value) ? prev.filter((v) => v !== d.value) : [...prev, d.value],
                      )
                    }
                    className={`size-8 rounded-lg border font-mono text-[11px] ${
                      weekdays.includes(d.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Prévia do calendário */}
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="mono-label">prévia do calendário</p>
            {plan.length === 0 ? (
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                adicione arquivos para ver a distribuição.
              </p>
            ) : (
              <>
                <p className="mt-1 font-mono text-[11px] text-primary">
                  {plan.length} publicação(ões) em {days.length} dia(s)
                </p>
                <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
                  {days.map((day, di) => (
                    <div key={day.key} className="rounded-lg border border-border bg-background p-2.5">
                      <p className="font-mono text-[11px] font-semibold uppercase text-foreground">{day.label}</p>
                      <div className="mt-1.5 space-y-1">
                        {day.items.map((item, ii) => {
                          const index = days.slice(0, di).reduce((acc, d) => acc + d.items.length, 0) + ii;
                          const file = ordered[index];
                          return (
                            <p key={ii} className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                              <span className="text-primary">
                                {item.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <span className="truncate">{file?.name ?? "—"}</span>
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="space-y-3 border-t border-border px-5 py-4">
          <label className="flex items-start gap-2 font-mono text-[11px] text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            Confirmo que tenho direitos sobre estes arquivos e autorizo a publicação automática nas contas
            selecionadas.
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              {busy ? `enviando ${progress.done}/${progress.total}…` : `${ordered.length} arquivo(s) na fila`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={run} disabled={busy || ordered.length === 0}>
                {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CalendarClock className="mr-1 size-4" />}
                Agendar tudo
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
