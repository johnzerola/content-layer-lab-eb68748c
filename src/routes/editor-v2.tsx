import { createFileRoute } from "@tanstack/react-router";
import { EditorV2Foundation } from "@/components/editor-v2/EditorV2Foundation";
import { EDITOR_V2_ENABLED } from "@/lib/editor-v2";

export const Route = createFileRoute("/editor-v2")({
  head: () => ({ meta: [{ title: "Editor V2 — VaiViral" }, { name: "description", content: "Fundação isolada do Editor V2 e sua Library." }] }),
  component: EditorV2Route,
});

function EditorV2Route() {
  if (!EDITOR_V2_ENABLED) {
    return <main className="grid min-h-screen place-items-center bg-background p-6 text-center"><div className="max-w-md"><p className="mono-label">Editor V2</p><h1 className="mt-2 text-xl font-semibold">Experiência em validação</h1><p className="mt-2 text-sm text-muted-foreground">A fundação está instalada, mas permanece isolada pela feature flag.</p></div></main>;
  }
  return <EditorV2Foundation />;
}

