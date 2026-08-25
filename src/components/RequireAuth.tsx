import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AuthGate } from "@/components/AuthGate";

/** Tela protegida: em vez de redirecionar em silêncio para o painel,
 *  mostra o login explicando qual ferramenta precisa da conta. */
export function RequireAuth({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <AuthGate
      title={title}
      description={description}
      fallbackExtra={
        <Link
          to="/"
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Voltar ao painel
        </Link>
      }
    >
      {children}
    </AuthGate>
  );
}
