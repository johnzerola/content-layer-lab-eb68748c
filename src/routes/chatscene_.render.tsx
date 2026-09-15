/** Tela de render do ChatScene: cena em tempo real + trilhas de fundo e vozes. */
import { createFileRoute } from "@tanstack/react-router";
import { RouteShell } from "@/components/RouteShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RenderStage } from "@/components/chatscene/RenderStage";

export const Route = createFileRoute("/chatscene_/render")({
  head: () => ({
    meta: [
      { title: "Render em tempo real — ChatScene | VaiViral" },
      {
        name: "description",
        content:
          "Assista à conversa animada em tempo real com fundo e vozes, e veja a linha do tempo com início e fim de cada mensagem antes de exportar.",
      },
      { property: "og:title", content: "Render em tempo real do ChatScene" },
      {
        property: "og:description",
        content: "Cena 9:16 tocando com fundo e vozes, ao lado das trilhas de mensagens e falas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <RouteShell>
      <RequireAuth title="Render" description="Entre para assistir ao render da sua conversa.">
        <RenderStage />
      </RequireAuth>
    </RouteShell>
  ),
});
