import { RequireAuth } from "@/components/RequireAuth";
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMetrics,
  getPublishedPosts,
  refreshPostMetrics,
  refreshAllMetrics,
  type PostInsight,
  type PublishedPostRef,
} from '@/lib/metrics.functions';
import { getClipFeedback } from '@/lib/clip-feedback';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart3,
  Eye,
  Heart,
  Share2,
  MousePointerClick,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Brain,
  Instagram,
  Youtube,
  Facebook,
  ExternalLink,
  PlaySquare,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AppShell } from '@/components/AppShell';

export const Route = createFileRoute('/metricas')({
  component: GuardedMetricsPage,
  head: () => ({
    meta: [
      { title: 'Métricas por plataforma · VaiViral' },
      {
        name: 'description',
        content:
          'Acompanhe cliques, visualizações e compartilhamentos de cada post da Agenda no Instagram, Facebook e YouTube.',
      },
      { property: 'og:title', content: 'Métricas por plataforma · VaiViral' },
      {
        property: 'og:description',
        content: 'Cliques, views e compartilhamentos de cada publicação agendada, separados por rede social.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
});

const PLATFORMS: Array<{ id: string; label: string; icon: typeof Instagram; color: string }> = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500' },
  { id: 'tiktok', label: 'TikTok', icon: PlaySquare, color: 'text-cyan-400' },
];

type Row = {
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
  fetchedAt: string | null;
};

function mergeRows(metrics: PostInsight[], posts: PublishedPostRef[]): Row[] {
  const byPost = new Map<string, PostInsight>();
  for (const m of metrics) byPost.set(m.post_id, m);

  const rows: Row[] = posts.map((p) => {
    const m = byPost.get(p.id);
    byPost.delete(p.id);
    return {
      postId: p.id,
      title: p.caption,
      platform: p.platform,
      username: p.username,
      permalink: p.permalink,
      publishedAt: p.published_at,
      views: m?.views ?? 0,
      clicks: m?.clicks ?? 0,
      shares: m?.shares ?? 0,
      likes: m?.likes ?? 0,
      fetchedAt: m?.fetched_at ?? null,
    };
  });

  for (const m of byPost.values()) {
    rows.push({
      postId: m.post_id,
      title: m.post_title ?? 'Sem título',
      platform: m.platform ?? 'desconhecida',
      username: m.username ?? '',
      permalink: m.permalink ?? null,
      publishedAt: m.published_at ?? null,
      views: m.views ?? 0,
      clicks: m.clicks ?? 0,
      shares: m.shares ?? 0,
      likes: m.likes ?? 0,
      fetchedAt: m.fetched_at,
    });
  }

  return rows.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

function MetricsPage() {
  const queryClient = useQueryClient();
  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => getMetrics(),
  });
  const { data: publishedPosts = [] } = useQuery({
    queryKey: ['published-posts'],
    queryFn: () => getPublishedPosts(),
  });
  const { data: feedback, isLoading: feedbackLoading } = useQuery({
    queryKey: ['clip-feedback'],
    queryFn: () => getClipFeedback(),
  });

  const rows = mergeRows(metrics, publishedPosts);

  const refreshMutation = useMutation({
    mutationFn: (postId: string) => refreshPostMetrics({ data: { postId } }),
    onSuccess: (result) => {
      if (result?.ok === false) toast.error(result.error ?? 'Não foi possível ler as métricas.');
      else toast.success('Métricas atualizadas na rede social.');
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    },
    onError: () => toast.error('Falha ao atualizar as métricas.'),
  });

  const refreshAll = useMutation({
    mutationFn: () => refreshAllMetrics(),
    onSuccess: (result) => {
      toast.success(`${result.updated} post(s) atualizados${result.failed ? `, ${result.failed} com erro` : ''}.`);
      if (result.errors[0]) toast.error(result.errors[0]);
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    },
    onError: () => toast.error('Falha ao atualizar as métricas.'),
  });

  const totalViews = rows.reduce((acc, r) => acc + r.views, 0);
  const totalClicks = rows.reduce((acc, r) => acc + r.clicks, 0);
  const totalShares = rows.reduce((acc, r) => acc + r.shares, 0);

  const platformData = PLATFORMS.map((p) => {
    const list = rows.filter((r) => r.platform === p.id);
    return {
      id: p.id,
      name: p.label,
      posts: list.length,
      views: list.reduce((a, r) => a + r.views, 0),
      clicks: list.reduce((a, r) => a + r.clicks, 0),
      shares: list.reduce((a, r) => a + r.shares, 0),
    };
  }).filter((p) => p.posts > 0);

  return (
    <AppShell mode="lote" onMode={() => {}} count={0} onLibrary={() => {}} onCloud={() => {}}>
      <div className="p-6 space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Métricas por plataforma</h1>
            <p className="text-muted-foreground">
              Cliques, visualizações e compartilhamentos de cada post da Agenda.
            </p>
          </div>
          <Button variant="outline" onClick={() => refreshAll.mutate()} disabled={refreshAll.isPending || isLoading}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${refreshAll.isPending ? 'animate-spin' : ''}`} />
            Atualizar tudo
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visualizações</CardTitle>
              <Eye className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalViews.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground">Somando todas as redes conectadas</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cliques / interações</CardTitle>
              <MousePointerClick className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClicks.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground">Cliques no post e no link</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Compartilhamentos</CardTitle>
              <Share2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalShares.toLocaleString('pt-BR')}</div>
              <p className="text-xs text-muted-foreground">Envios e repostagens</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Comparativo entre redes</CardTitle>
            <CardDescription>Views, cliques e compartilhamentos por plataforma.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformData.length ? platformData : [{ name: 'Sem dados', views: 0, clicks: 0, shares: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }} />
                <Legend />
                <Bar dataKey="views" name="Views" fill="#7c5cff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="clicks" name="Cliques" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="shares" name="Shares" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {PLATFORMS.filter((p) => rows.some((r) => r.platform === p.id)).map((platform) => {
          const list = rows.filter((r) => r.platform === platform.id);
          const Icon = platform.icon;
          return (
            <Card key={platform.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${platform.color}`} />
                  {platform.label}
                </CardTitle>
                <CardDescription>
                  {list.length} publicação(ões) · {list.reduce((a, r) => a + r.views, 0).toLocaleString('pt-BR')} views
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase border-b border-border/50">
                      <tr>
                        <th className="px-4 py-3">Post</th>
                        <th className="px-4 py-3 text-right">Views</th>
                        <th className="px-4 py-3 text-right">Cliques</th>
                        <th className="px-4 py-3 text-right">Shares</th>
                        <th className="px-4 py-3 text-right">Likes</th>
                        <th className="px-4 py-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {list.map((r) => (
                        <tr key={r.postId} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-4 max-w-[280px]">
                            <p className="truncate font-medium">{r.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.username ? `@${r.username} · ` : ''}
                              {r.publishedAt
                                ? new Date(r.publishedAt).toLocaleString('pt-BR')
                                : 'sem data'}
                              {r.fetchedAt ? '' : ' · sem coleta ainda'}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-right">{r.views.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-4 text-right">{r.clicks.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-4 text-right">{r.shares.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-4 text-right">{r.likes.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-4 text-right whitespace-nowrap">
                            {r.permalink && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={r.permalink} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => refreshMutation.mutate(r.postId)}
                              disabled={refreshMutation.isPending}
                            >
                              <RefreshCcw className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {rows.length === 0 && (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <BarChart3 className="mx-auto h-12 w-12 opacity-20 mb-4" />
              <p>Nenhum post publicado ainda. Agende publicações para começar a medir.</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Aprendizado da IA
            </CardTitle>
            <CardDescription>
              Etiquetas usadas nos cortes, comparadas com o desempenho real das publicações.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feedbackLoading ? (
              <p className="text-sm text-muted-foreground">Calculando…</p>
            ) : !feedback || feedback.tags.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Brain className="mx-auto h-10 w-10 opacity-20 mb-3" />
                <p>Ainda não há dados suficientes. Agende cortes e aguarde as métricas chegarem.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Base: {feedback.samples} publicações · engajamento médio{' '}
                  {(feedback.baseline * 100).toFixed(1)}%
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {feedback.tags.map((t) => {
                    const up = t.weight >= 1;
                    return (
                      <div
                        key={t.tag}
                        className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium capitalize">{t.tag}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.samples} posts · {(t.engagement * 100).toFixed(1)}% eng.
                          </p>
                        </div>
                        <span
                          className={`flex items-center gap-1 text-sm font-semibold ${
                            up ? 'text-emerald-500' : 'text-destructive'
                          }`}
                        >
                          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          ×{t.weight.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Heart className="h-3 w-3" /> Os números vêm direto das APIs oficiais das redes conectadas.
        </p>
      </div>
    </AppShell>
  );
}

function GuardedMetricsPage() {
  return (
    <RequireAuth
      title={"Métricas requer login"}
      description={"Entre para ver o desempenho real dos seus posts publicados."}
    >
      <MetricsPage />
    </RequireAuth>
  );
}
