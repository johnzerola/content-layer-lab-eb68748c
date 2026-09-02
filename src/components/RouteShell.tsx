import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

/** Shell completo para páginas internas que não mantêm uma fila própria. */
export function RouteShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const goHome = () => void navigate({ to: "/" });

  return (
    <AppShell
      mode="external"
      onMode={goHome}
      count={0}
      onLibrary={goHome}
      onCloud={() => void navigate({ to: "/conta" })}
    >
      {children}
    </AppShell>
  );
}