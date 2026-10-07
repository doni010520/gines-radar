"use client";

import { useRef } from "react";

/** Caixinhas de bairro do formulário de busca, com atalhos "todos" / "nenhum". Escala pra muitos bairros. */
export function SelecaoBairros({ bairros }: { bairros: { id: string; nome: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const marcar = (v: boolean) =>
    ref.current?.querySelectorAll<HTMLInputElement>('input[name="bairros"]').forEach((i) => (i.checked = v));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold text-ink-muted">Bairros</span>
        <button type="button" onClick={() => marcar(true)} className="text-primary hover:underline">
          marcar todos
        </button>
        <button type="button" onClick={() => marcar(false)} className="text-primary hover:underline">
          desmarcar
        </button>
      </div>
      <div ref={ref} className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {bairros.map((b) => (
          <label
            key={b.id}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink has-[:checked]:border-primary has-[:checked]:bg-surface"
          >
            <input type="checkbox" name="bairros" value={b.id} defaultChecked className="h-4 w-4 accent-[var(--color-primary)]" />
            {b.nome}
          </label>
        ))}
      </div>
    </div>
  );
}
