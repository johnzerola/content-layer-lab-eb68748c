/** Analogue ChatScene — criação de vídeos verticais a partir de conversas. */
import { createFileRoute } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { RouteShell } from "@/components/RouteShell";
import { ChatSceneStudio } from "@/components/chatscene/ChatSceneStudio";

export const Route = createFileRoute("/chatscene")({
  head: () => ({
    meta: [
      { title: "ChatScene — vídeos de conversa vertical | VaiViral" },
      {
        name: "description",
        content:
          "Escreva uma conversa, escolha o visual e exporte um vídeo vertical animado em MP4 — com grupos, ritmo ajustável e prévia 9:16.",
      },
      { property: "og:title", content: "ChatScene — vídeos de conversa vertical" },
      {
        property: "og:description",
        content: "Transforme uma conversa escrita em vídeo vertical animado, pronto para Reels, TikTok e Shorts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RouteShell>
      <RequireAuth
        title="ChatScene"
        description="Entre na sua conta para criar vídeos de conversa."
      >
        <ChatSceneStudio />
      </RequireAuth>
    </RouteShell>
  ),
});
