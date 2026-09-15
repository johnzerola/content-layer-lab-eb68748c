import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { currentUser, onAuth, type CloudUser } from "@/lib/cloud";

/** Sessão atual (null = visitante). Atualiza quando o usuário entra ou sai. */
export function useAccount() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void currentUser().then((u) => {
      if (!alive) return;
      setUser(u);
      setReady(true);
    });
    const off = onAuth((u) => {
      setUser(u);
      setReady(true);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  return { user, ready };
}

type Props = {
  className?: string;
  /** rótulo para quem ainda não tem sessão */
  guestLabel?: string;
  /** rótulo para quem já está com a conta ativa */
  memberLabel?: string;
  /** plano levado ao checkout quando é visitante */
  plano?: string;
  showArrow?: boolean;
};

/**
 * CTA que leva direto ao estúdio quando existe uma conta ativa
 * e ao cadastro/login quando o visitante ainda não entrou.
 */
export function AccountCta({
  className = "",
  guestLabel = "Começar agora",
  memberLabel = "Abrir meu estúdio",
  plano = "creator",
  showArrow = true,
}: Props) {
  const { user } = useAccount();

  if (user) {
    return (
      <Link to="/editor" className={className}>
        {memberLabel}
        {showArrow ? <ArrowRight className="size-4" /> : null}
      </Link>
    );
  }

  return (
    <Link to="/checkout" search={{ plano }} className={className}>
      {guestLabel}
      {showArrow ? <ArrowRight className="size-4" /> : null}
    </Link>
  );
}
