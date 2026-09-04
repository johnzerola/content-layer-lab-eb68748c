import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacidade e LGPD - VaiViral" },
      {
        name: "description",
        content:
          "Como o VaiViral coleta, usa e apaga seus dados, incluindo as contas do Instagram e Facebook conectadas para publicação.",
      },
      { property: "og:title", content: "Privacidade e LGPD - VaiViral" },
      {
        property: "og:description",
        content: "Política de privacidade do VaiViral: dados coletados, uso das contas sociais e exclusão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CONTACT = "privacidade@vaiviral.app";

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-sm leading-relaxed">
      <Link to="/" className="text-muted-foreground hover:text-foreground">
        Voltar
      </Link>
      <h1 className="mt-6 font-display text-3xl font-bold">Privacidade e LGPD</h1>
      <p className="mt-4 text-muted-foreground">
        Coletamos dados de conta, templates, histórico de lotes, jobs do CleanerIA, arquivos agendados e logs técnicos
        necessários para operar o serviço.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Arquivos e vídeos</h2>
      <p className="mt-2 text-muted-foreground">
        Vídeos do lote comum ficam no navegador. CleanerIA envia o arquivo para a VPS de processamento. Agenda armazena
        o arquivo em nuvem até a publicação e remove o arquivo após envio bem-sucedido. Links importados são
        resolvidos por servidor com tickets temporários.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Contas do Instagram e Facebook (Meta)</h2>
      <p className="mt-2 text-muted-foreground">
        A conexão é feita pelo Login do Facebook. Nunca pedimos nem guardamos a sua senha — você autoriza o acesso na
        própria Meta e recebemos um token.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">O que recebemos:</strong> identificador da conta na Meta, nome de
          usuário, nome e foto do perfil profissional, lista de Páginas que você administra e o token de acesso.
        </li>
        <li>
          <strong className="text-foreground">Para que usamos:</strong> exclusivamente para listar suas contas no
          painel e publicar/agendar Reels, vídeos de feed e stories que você mesmo enviou.
        </li>
        <li>
          <strong className="text-foreground">Como guardamos:</strong> o token fica criptografado no banco, isolado por
          usuário, acessível apenas pelo servidor no momento da publicação. Não vendemos, alugamos nem compartilhamos
          esses dados com terceiros.
        </li>
        <li>
          <strong className="text-foreground">Por quanto tempo:</strong> enquanto a conta estiver conectada. Ao
          desconectar, o token e a conexão são apagados imediatamente.
        </li>
        <li>
          <strong className="text-foreground">Como revogar:</strong> remova a conta em Minhas contas, ou retire o app
          em Facebook &gt; Configurações &gt; Apps e sites. Quando a Meta nos avisa da remoção, apagamos os dados
          automaticamente.
        </li>
      </ul>

      <h2 className="mt-8 font-display text-xl font-semibold">Seus direitos</h2>
      <p className="mt-2 text-muted-foreground">
        Você pode solicitar acesso, correção ou exclusão dos dados a qualquer momento. Veja o passo a passo em{" "}
        <Link to="/exclusao-de-dados" className="underline">
          exclusão de dados
        </Link>
        . A página de conta permite iniciar a exclusão da conta e de tudo que está vinculado a ela.
      </p>

      <h2 className="mt-8 font-display text-xl font-semibold">Contato</h2>
      <p className="mt-2 text-muted-foreground">
        Dúvidas sobre privacidade:{" "}
        <a href={`mailto:${CONTACT}`} className="underline">
          {CONTACT}
        </a>
        .
      </p>

      <p className="mt-8 text-muted-foreground">
        <Link to="/termos" className="underline">
          Termos de uso
        </Link>{" "}
        ·{" "}
        <Link to="/exclusao-de-dados" className="underline">
          Exclusão de dados
        </Link>
      </p>
    </main>
  );
}
