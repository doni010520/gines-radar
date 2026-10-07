"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Bairro = { id: string; nome: string; zona: string };

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Seletor de bairros para a busca: fechado ocupa uma linha ("Todos os bairros (40)"),
 * aberto tem pesquisa, atalhos e lista com rolagem agrupada por zona. Escala pra dezenas de bairros.
 * Os escolhidos vão no formulário como inputs hidden name="bairros".
 */
export function SelecaoBairros({ bairros }: { bairros: Bairro[] }) {
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(bairros.map((b) => b.id)));
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const visiveis = useMemo(() => {
    const f = normalizar(filtro.trim());
    return f ? bairros.filter((b) => normalizar(`${b.nome} ${b.zona}`).includes(f)) : bairros;
  }, [bairros, filtro]);

  const porZona = useMemo(() => {
    const g = new Map<string, Bairro[]>();
    for (const b of visiveis) g.set(b.zona || "Sem zona", [...(g.get(b.zona || "Sem zona") ?? []), b]);
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visiveis]);

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const marcar = (ids: string[], v: boolean) =>
    setSelecionados((s) => {
      const n = new Set(s);
      ids.forEach((id) => (v ? n.add(id) : n.delete(id)));
      return n;
    });

  const nomesSel = bairros.filter((b) => selecionados.has(b.id)).map((b) => b.nome);
  const resumo =
    nomesSel.length === 0
      ? "Nenhum bairro"
      : nomesSel.length === bairros.length
        ? `Todos os bairros (${bairros.length})`
        : nomesSel.length <= 2
          ? nomesSel.join(", ")
          : `${nomesSel.slice(0, 2).join(", ")} +${nomesSel.length - 2}`;

  return (
    <div ref={caixa} className="relative min-w-64 flex-1">
      {[...selecionados].map((id) => (
        <input key={id} type="hidden" name="bairros" value={id} />
      ))}
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-muted px-3 text-left text-sm text-ink hover:border-border-strong"
      >
        <span className="truncate">
          <span className="text-ink-muted">Bairros: </span>
          {resumo}
        </span>
        <span aria-hidden className="text-ink-subtle">
          ▾
        </span>
      </button>

      {aberto && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface p-2 shadow-float">
          <input
            autoFocus
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="filtrar bairro ou zona…"
            aria-label="Filtrar bairros"
            className="min-h-10 w-full rounded-md border border-border bg-surface-muted px-3 text-sm text-ink focus:border-primary"
          />
          <div className="flex gap-3 px-1 py-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => marcar(visiveis.map((b) => b.id), true)}>
              marcar {filtro ? "os filtrados" : "todos"}
            </button>
            <button type="button" className="text-primary hover:underline" onClick={() => marcar(visiveis.map((b) => b.id), false)}>
              desmarcar {filtro ? "os filtrados" : "todos"}
            </button>
            <span className="ml-auto text-ink-subtle">
              {selecionados.size} de {bairros.length}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {porZona.length === 0 && <p className="px-2 py-3 text-sm text-ink-muted">Nenhum bairro com esse nome.</p>}
            {porZona.map(([zona, lista]) => (
              <div key={zona} className="pb-1">
                <p className="px-2 pt-2 pb-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">{zona}</p>
                {lista.map((b) => (
                  <label key={b.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-ink hover:bg-surface-muted">
                    <input type="checkbox" checked={selecionados.has(b.id)} onChange={() => alternar(b.id)} className="h-4 w-4 accent-[var(--color-primary)]" />
                    {b.nome}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
