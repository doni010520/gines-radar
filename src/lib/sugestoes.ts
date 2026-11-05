import { normalizar } from "./analise";
import { loft } from "./fontes/loft";
import { zap } from "./fontes/zap";
import type { BairroBusca } from "./fontes/tipos";

/**
 * Bairro cadastrado que não trouxe nenhum anúncio quase sempre é nome diferente do portal
 * ("Monte Alegre" x "Vila Monte Alegre", Gines 04/11/26). Lê uns anúncios da cidade inteira
 * (ZAP + Loft, os mais completos) e devolve os nomes de bairro parecidos com o digitado.
 */
export async function sugerirBairros(b: BairroBusca): Promise<string[]> {
  const cidade = { ...b, nome: "", zona: "" };
  const contagem = new Map<string, { nome: string; n: number }>();
  const conta = (nome: string | null | undefined) => {
    if (!nome) return;
    const k = normalizar(nome).trim();
    const atual = contagem.get(k);
    contagem.set(k, { nome: atual?.nome ?? nome, n: (atual?.n ?? 0) + 1 });
  };
  for (let p = 0; p < 4; p++) {
    try {
      (await zap.buscarPagina(cidade, p)).forEach((a) => conta(a.bairro));
    } catch {
      break;
    }
  }
  try {
    (await loft.buscarPagina(cidade, 0)).forEach((a) => conta(a.bairro));
  } catch {
    // sem Loft, fica só com o ZAP
  }

  const alvo = normalizar(b.nome).trim();
  const palavras = alvo.split(/\s+/).filter((w) => w.length > 2 && !["jardim", "vila", "parque", "residencial"].includes(w));
  return [...contagem.entries()]
    .map(([k, v]) => {
      // contém o nome digitado ("vila monte alegre" ⊃ "monte alegre") > divide palavras > nada
      const nota = k.includes(alvo) || alvo.includes(k) ? 3 : palavras.filter((w) => k.includes(w)).length;
      return { ...v, nota };
    })
    .filter((x) => x.nota > 0)
    .sort((x, y) => y.nota - x.nota || y.n - x.n)
    .slice(0, 4)
    .map((x) => x.nome);
}
