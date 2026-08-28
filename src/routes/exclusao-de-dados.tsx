import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AuthGate } from "@/components/AuthGate";
import { currentUser, onAuth, type CloudUser } from "@/lib/cloud";
import {
  createDataDeletionRequest,
  listMyDataDeletionRequests,
} from "@/lib/data-deletion.functions";

export const Route = createFileRoute("/exclusao-de-dados")({
  component: DataDeletionPage,
  head: () => ({
    meta: [
      { title: "Exclusão de dados - VaiViral" },
      {
        name: "description",
        content:
          "Como solicitar a exclusão dos seus dados e das contas do Instagram e Facebook conectadas ao VaiViral.",
      },
      { property: "og:title", content: "Exclusão de dados - VaiViral" },
      {
        property: "og:description",
        content: "Solicite a remoção das suas contas conectadas e dos seus dados no VaiViral.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CONTACT = "privacidade@vaiviral.app";

type DeletionRequest = Awaited<ReturnType<typeof listMyDataDeletionRequests>>[number];

const statusLabels: Record<string, string> = {
  pending: "Recebido",
  processing: "Em processamento",
  completed: "Concluído",
  rejected: "Não aprovado",
};

function DataDeletionPage() {
  const submitRequest = useServerFn(createDataDeletionRequest);
  const fetchRequests = useServerFn(listMyDataDeletionRequests);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [facebook, setFacebook] = useState(true);
  const [instagram, setInstagram] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);

  useEffect(() => {
    const off = onAuth((nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    currentUser()
      .then(setUser)
      .finally(() => setAuthReady(true));
    return off;
  }, []);

  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }
    fetchRequests()
      .then(setRequests)
      .catch(() => toast.error("Não foi possível carregar seus pedidos."));
  }, [fetchRequests, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const platforms = [facebook ? "facebook" : null, instagram ? "instagram" : null].filter(
      (platform): platform is "facebook" | "instagram" => platform !== null,
    );
    if (!platforms.length) {
      toast.error("Selecione Facebook ou Instagram.");
      return;
    }
    if (reason.trim().length > 1000) {
      toast.error("O motivo deve ter até 1.000 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitRequest({ data: { platforms, reason: reason.trim() || undefined } });
      toast.success(result.created ? "Pedido de exclusão registrado." : "Você já possui um pedido em andamento.");
      setReason("");
      setRequests(await fetchRequests());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-sm leading-relaxed">
      <Link to="/" className="text-muted-foreground hover:text-foreground">
        Voltar
      </Link>
      <h1 className="mt-6 font-display text-3xl font-bold">Exclusão de dados</h1>
      <p className="mt-4 text-muted-foreground">
        Você pode remover, a qualquer momento, as contas sociais conectadas e todos os dados que o VaiViral guarda
        sobre você. Nenhuma senha de rede social é armazenada: guardamos apenas o token de acesso criptografado que a
        Meta emite quando você autoriza o app.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Remoção imediata (recomendado)</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>
          Entre no VaiViral e abra <Link to="/integracoes" className="underline">Minhas contas</Link>.
        </li>
        <li>Clique em remover na conta do Instagram ou Facebook que deseja desconectar.</li>
        <li>
          A conexão e o token criptografado são apagados na hora. Você também pode revogar o acesso em
          Facebook &gt; Configurações &gt; Apps e sites.
        </li>
      </ol>

      <h2 className="mt-8 font-display text-xl font-semibold">Excluir a conta inteira</h2>
      <p className="mt-2 text-muted-foreground">
        Na página <Link to="/conta" className="underline">Conta</Link> você inicia a exclusão do cadastro. Isso apaga
        perfil, templates, lotes, agendamentos, arquivos guardados e todas as conexões sociais.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Pedido por e-mail</h2>
      <p className="mt-2 text-muted-foreground">
        Se você não consegue acessar o app, envie um pedido para{" "}
        <a href={`mailto:${CONTACT}`} className="underline">
          {CONTACT}
        </a>{" "}
        com o e-mail do cadastro e o nome de usuário da rede social. Confirmamos o pedido e concluímos a exclusão em
        até 30 dias.
      </p>

      <section className="mt-8 border-y border-border py-7" aria-labelledby="request-title">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 id="request-title" className="font-display text-xl font-semibold">
              Solicitar exclusão dos dados da Meta
            </h2>
            <p className="mt-1 text-muted-foreground">
              Registre o pedido e acompanhe pelo código de confirmação. O prazo de conclusão é de até 30 dias.
            </p>
          </div>
        </div>

        {!authReady ? (
          <Loader2 className="mt-6 size-5 animate-spin text-muted-foreground" aria-label="Carregando conta" />
        ) : !user ? (
          <div className="mt-6">
            <AuthGate
              title="Entre para solicitar a exclusão"
              description="O login protege sua identidade e permite acompanhar o pedido pelo código de confirmação."
            >
              <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
            </AuthGate>
          </div>
        ) : (
          <>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
              <fieldset>
                <legend className="font-medium">Quais dados deseja excluir?</legend>
                <div className="mt-3 flex flex-wrap gap-x-7 gap-y-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox checked={facebook} onCheckedChange={(checked) => setFacebook(checked === true)} />
                    Facebook
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <Checkbox checked={instagram} onCheckedChange={(checked) => setInstagram(checked === true)} />
                    Instagram
                  </label>
                </div>
              </fieldset>
              <label className="block">
                <span className="font-medium">Informações adicionais (opcional)</span>
                <Textarea
                  className="mt-2 min-h-28"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Descreva somente o necessário para identificarmos o pedido."
                />
                <span className="mt-1 block text-right text-xs text-muted-foreground">{reason.length}/1000</span>
              </label>
              <Button type="submit" disabled={submitting || (!facebook && !instagram)}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Registrar pedido
              </Button>
            </form>

            {requests.length > 0 && (
              <div className="mt-8">
                <h3 className="font-display text-base font-semibold">Seus pedidos</h3>
                <ul className="mt-3 divide-y divide-border border-y border-border">
                  {requests.map((request) => (
                    <li key={request.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-mono text-xs font-semibold">{request.confirmation_code}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {request.platforms.join(" e ")} · {new Date(request.requested_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium sm:mt-0">
                        {request.status === "completed" && <CheckCircle2 className="size-4 text-primary" />}
                        {statusLabels[request.status] ?? request.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <h2 className="mt-8 font-display text-xl font-semibold">O que é apagado</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>Contas sociais conectadas, tokens criptografados e páginas selecionadas.</li>
        <li>Agendamentos pendentes e arquivos de mídia guardados para publicação.</li>
        <li>Templates, histórico de lotes, jobs de limpeza e resultados na biblioteca.</li>
        <li>Perfil, plano e registros de uso.</li>
      </ul>
      <p className="mt-2 text-muted-foreground">
        Logs técnicos sem identificação pessoal podem ser mantidos por até 90 dias para segurança e prevenção de abuso.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Pedidos vindos da Meta</h2>
      <p className="mt-2 text-muted-foreground">
        Quando você remove o VaiViral pelo painel do Facebook ou do Instagram, a Meta nos avisa automaticamente e as
        conexões e tokens daquela conta são apagados sem que você precise fazer mais nada.
      </p>

      <p className="mt-8 text-muted-foreground">
        <Link to="/privacidade" className="underline">
          Política de privacidade
        </Link>{" "}
        ·{" "}
        <Link to="/termos" className="underline">
          Termos de uso
        </Link>
      </p>
    </main>
  );
}
