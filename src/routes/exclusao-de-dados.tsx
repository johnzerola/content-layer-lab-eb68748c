import { createFileRoute, Link } from "@tanstack/react-router";

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

function DataDeletionPage() {
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
