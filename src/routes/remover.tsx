/** Compatibilidade: a antiga ferramenta foi consolidada no CleanerIA. */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/remover")({
  beforeLoad: () => {
    throw redirect({ to: "/limpar-ia", replace: true });
  },
});
