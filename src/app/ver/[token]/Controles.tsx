"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Enquanto a busca está aguardando/rodando, recarrega a tela a cada 4s pra mostrar o progresso. */
export function AtualizaSozinho({ ativo }: { ativo: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [ativo, router]);
  return null;
}

/** Botão que chama uma server action já amarrada (bind), com confirmação opcional. */
export function Acao({
  acao,
  rotulo,
  pendente = "...",
  confirmar,
  variant = "ghost",
  size = "sm",
  disabled = false,
}: {
  acao: () => Promise<void>;
  rotulo: string;
  pendente?: string;
  confirmar?: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={pending || disabled}
      onClick={() => {
        if (confirmar && !confirm(confirmar)) return;
        startTransition(() => acao());
      }}
    >
      {pending ? pendente : rotulo}
    </Button>
  );
}
