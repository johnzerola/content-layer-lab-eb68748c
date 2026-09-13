/**
 * Painéis de desempenho por página/canal e por vídeo.
 *
 * Apresentação apenas: consome as linhas já carregadas na tela de Métricas
 * (nenhuma consulta nova ao banco).
 */
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Trophy,
  Users,
} from "lucide-react";

export type MetricRow = {
  postId: string;
  title: string;
  platform: string;
  username: string;
  permalink: string | null;
  publishedAt: string | null;
  views: number;
  clicks: number;
  shares: number;
  likes: number;
  comments: number;
  saves: number;
  fetchedAt: string | null;
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const n = (v: number) => v.toLocaleString("pt-BR");

function engagement(r: { likes: number; comments: number; shares: number; saves: number; views: number }) {
  if (!r.views) return 0;
  return (r.likes + r.comments + r.shares + r.saves) / r.views;
}

/** Um cartão por página/canal conectado, com totais e melhor vídeo. */
export function ChannelCards({ rows }: { rows: MetricRow[] }) {
  const channels = useMemo(() => {
    const map = new Map<string, MetricRow[]>();
    for (const r of rows) {
      const key = `${r.platform}::${r.username}`;
      const list = map.get(key);
      if (list) list.push(r);
      else map.set(key, [r]);
    }
    return [...map.entries()]
      .map(([key, list]) => {
        const sum = (pick: (r: MetricRow) => number) => list.reduce((a, r) => a + pick(r), 0);
        const totals = {
          views: sum((r) => r.views),
          likes: sum((r) => r.likes),
          comments: sum((r) => r.comments),
          shares: sum((r) => r.shares),
          saves: sum((r) => r.saves),
        };
        const best = [...list].sort((a, b) => b.views - a.views)[0] ?? null;
        return {
          key,
          platform: list[0]!.platform,
          username: list[0]!.username,
          posts: list.length,
          ...totals,
          engagement: engagement({ ...totals }),
          best,
        };
      })
      .sort((a, b) => b.views - a.views);
  }, [rows]);

  if (!channels.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Páginas e canais
        </CardTitle>
        <CardDescription>
          Desempenho somado de cada conta conectada, com o vídeo que mais rendeu.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {channels.map((c) => (
          <div key={c.key} className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {c.username ? `@${c.username}` : "Conta sem nome"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_LABEL[c.platform] ?? c.platform} · {c.posts} publicação(ões)
                </p>
              </div>
              <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-mono text-primary">
                {(c.engagement * 100).toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { icon: Eye, label: "Views", value: c.views },
                { icon: Heart, label: "Curtidas", value: c.likes },
                { icon: MessageCircle, label: "Coment.", value: c.comments },
                { icon: Share2, label: "Shares", value: c.shares },
              ].map((m) => (
                <div key={m.label} className="rounded-lg bg-background/50 py-2">
                  <m.icon className="mx-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  <p className="mt-1 text-sm font-semibold">{n(m.value)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                </div>
              ))}
            </div>

            {c.best && (
              <div className="rounded-lg border border-border/40 px-3 py-2">
                <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Trophy className="h-3 w-3 text-amber-400" aria-hidden /> Melhor vídeo
                </p>
                <p className="truncate text-sm">{c.best.title}</p>
                <p className="text-xs text-muted-foreground">{n(c.best.views)} views</p>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

type SortKey = "views" | "likes" | "shares" | "engagement";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "views", label: "Views" },
  { id: "likes", label: "Curtidas" },
  { id: "shares", label: "Compartilhamentos" },
  { id: "engagement", label: "Engajamento" },
];

/** Ranking de vídeos de todas as contas juntas. */
export function VideoRanking({ rows }: { rows: MetricRow[] }) {
  const [sort, setSort] = useState<SortKey>("views");

  const ranked = useMemo(() => {
    const value = (r: MetricRow) =>
      sort === "engagement" ? engagement(r) : sort === "likes" ? r.likes : sort === "shares" ? r.shares : r.views;
    return [...rows].sort((a, b) => value(b) - value(a)).slice(0, 20);
  }, [rows, sort]);

  if (!ranked.length) return null;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div>
          <CardTitle>Ranking de vídeos</CardTitle>
          <CardDescription>Os 20 vídeos com melhor desempenho entre todas as contas.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Ordenar ranking">
          {SORTS.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={sort === s.id ? "default" : "outline"}
              aria-pressed={sort === s.id}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {ranked.map((r, i) => (
          <div
            key={r.postId}
            className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2"
          >
            <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {PLATFORM_LABEL[r.platform] ?? r.platform}
                {r.username ? ` · @${r.username}` : ""}
                {r.publishedAt ? ` · ${new Date(r.publishedAt).toLocaleDateString("pt-BR")}` : ""}
              </p>
            </div>
            <div className="hidden shrink-0 gap-4 text-right text-xs text-muted-foreground sm:flex">
              <span>{n(r.views)} views</span>
              <span>{n(r.likes)} curtidas</span>
              <span>{(engagement(r) * 100).toFixed(1)}% eng.</span>
            </div>
            {r.permalink && (
              <Button variant="ghost" size="sm" asChild>
                <a href={r.permalink} target="_blank" rel="noreferrer" aria-label="Abrir publicação">
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
