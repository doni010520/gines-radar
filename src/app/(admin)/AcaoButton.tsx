"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ButtonVariant } from "@/components/ui/button";

/** Botão que chama uma server action já "amarrada" (bind), com confirmação opcional. */
export function AcaoButton({
  acao,
  rotulo,
  pendente,
  confirmar,
  variant = "ghost",
}: {
  acao: () => Promise<void>;
  rotulo: string;
  pendente: string;
  confirmar?: string;
  variant?: ButtonVariant;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (confirmar && !confirm(confirmar)) return;
        startTransition(() => acao());
      }}
    >
      {pending ? pendente : rotulo}
    </Button>
  );
}
