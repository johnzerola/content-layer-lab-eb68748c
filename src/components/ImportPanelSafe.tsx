import React from "react";
import { FolderOpen, Link2, Loader2, Upload } from "lucide-react";
import { Button, Input } from "@/components/ui/base";
import { ImportPanel } from "@/components/ImportPanel";
import { FLOWS } from "@/lib/flows";

type ImportPanelProps = React.ComponentProps<typeof ImportPanel>;

function useHydrated(): boolean {
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);
  return hydrated;
}

/**
 * Fallback minimalista e funcional: permite selecionar arquivos e colar link
 * mesmo quando o painel completo não pôde ser renderizado (SSR ou erro de runtime).
 */
function FallbackPanel({ props }: { props: ImportPanelProps }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);
  const flow = FLOWS[props.mode].import;

  return (
    <section className="glass rounded-2xl border border-border p-6 text-center">
      <h2 className="font-display text-lg font-semibold">{flow.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{flow.hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        multiple={flow.multiple}
        className="hidden"
        onChange={(e) => {
          props.onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderRef}
        type="file"
        // @ts-expect-error atributo não padronizado, suportado pelos navegadores
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={(e) => {
          props.onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          {flow.filesLabel}
        </Button>
        {flow.folder && (
          <Button variant="outline" onClick={() => folderRef.current?.click()}>
            <FolderOpen className="size-4" />
            Selecionar pasta
          </Button>
        )}
      </div>

      {flow.link && (
        <div className="mx-auto mt-4 flex max-w-lg gap-2">
          <Input
            value={props.linkUrl}
            onChange={(e) => props.onLinkUrl(e.target.value)}
            placeholder={flow.linkPlaceholder}
            className="flex-1"
            disabled={props.linkBlocked}
          />
          <Button
            onClick={props.onImportLink}
            disabled={props.linkBusy || props.linkBlocked || !props.linkUrl.trim()}
          >
            {props.linkBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Link2 className="size-4" />
            )}
            Importar
          </Button>
        </div>
      )}

      {props.linkMsg && <p className="mt-3 text-xs text-muted-foreground">{props.linkMsg}</p>}
    </section>
  );
}

class ImportPanelBoundary extends React.Component<
  { panelProps: ImportPanelProps },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error("ImportPanel falhou, usando fallback:", error);
  }

  override componentDidUpdate(prev: { panelProps: ImportPanelProps }) {
    // Se o modo mudou, tenta renderizar o painel completo novamente.
    if (this.state.failed && prev.panelProps.mode !== this.props.panelProps.mode) {
      this.setState({ failed: false });
    }
  }

  override render() {
    if (this.state.failed) return <FallbackPanel props={this.props.panelProps} />;
    return <ImportPanel {...this.props.panelProps} />;
  }
}

/**
 * ImportPanel seguro para SSR:
 * 1. No servidor (e no primeiro paint) renderiza o fallback estático — a home
 *    nunca quebra por erro de contexto/hidratação do painel completo.
 * 2. Após a hidratação, monta o painel completo dentro de um ErrorBoundary;
 *    qualquer falha de runtime volta ao fallback funcional.
 */
export function ImportPanelSafe(props: ImportPanelProps) {
  const hydrated = useHydrated();
  if (!hydrated) return <FallbackPanel props={props} />;
  return <ImportPanelBoundary panelProps={props} />;
}
