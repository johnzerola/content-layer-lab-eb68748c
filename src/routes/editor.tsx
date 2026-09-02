/** Atalho para abrir o editor profissional em um novo espaço de trabalho. */
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/editor")({
  head: () => ({
    meta: [
      { title: "Abrir editor profissional — VaiViral" },
      {
        name: "description",
        content: "Abra o editor profissional de vídeos verticais com transcrição, legendas, templates e timeline.",
      },
      { property: "og:title", content: "Abrir editor profissional — VaiViral" },
      { property: "og:description", content: "Transcrição, legendas, templates e timeline em um só editor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireAuth title="Editor profissional" description="Entre na sua conta para abrir o editor.">
      <OpenEditor />
    </RequireAuth>
  ),
});

function OpenEditor() {
  const navigate = useNavigate();
  useEffect(() => {
    const projectId = crypto.randomUUID();
    const videoId = crypto.randomUUID();
    void navigate({ to: "/projects/$projectId/editor/$videoId", params: { projectId, videoId }, replace: true });
  }, [navigate]);
  return <p className="p-8 text-sm text-muted-foreground">Abrindo editor…</p>;
}
