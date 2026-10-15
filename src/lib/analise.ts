/**
 * Regras do Gines (áudio de 06/10/26):
 *  1. Filtro principal é o deságio: R$/m² bem abaixo do que o bairro pratica. Ele olha os
 *     anúncios do bairro, tira a média e o que está muito abaixo (ex.: 5 mil num bairro de
 *     10 mil) é o que interessa.
 *  2. Palavras no texto do anúncio que indicam imóvel pra reforma/investidor.
 * Qualquer um dos dois já faz o anúncio virar oportunidade; o motivo diz qual foi.
 */

/** Minúsculas e sem acento — "Inventário" e "inventario" batem igual. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Critério de exclusão do Gines (14/10/26): leilão e imóvel vendido por banco não interessam.
 * Devolve o motivo, se o texto do anúncio (título, anunciante, descrição) indicar um deles.
 */
const EXCLUSOES: [RegExp, string][] = [
  [/\bleilao\b|\bleiloes\b|leiloeir|arrematac|arrematant|lance minimo|\b[12]\S? praca\b/, "leilão"],
  // nome de banco sozinho não exclui: descrição comum cita "agências Itaú e Santander por perto"
  [/imovel retomado|retomado pelo banco|venda direta (da )?caixa|imovel da caixa|imovel de banco|consolidacao da propriedade|alienacao fiduciaria/, "imóvel de banco"],
];
export function motivoExclusao(texto: string): string | null {
  const t = normalizar(texto);
  return EXCLUSOES.find(([re]) => re.test(t))?.[1] ?? null;
}

export function palavrasEncontradas(texto: string, termos: string[]): string[] {
  const t = normalizar(texto);
  return termos.filter((termo) => t.includes(normalizar(termo)));
}

export type Grupo = "terreno" | "casa" | "apartamento";
export const GRUPOS: Grupo[] = ["terreno", "casa", "apartamento"];

/**
 * Cada grupo tem m² de natureza diferente e a média é calculada separada. Casa e apartamento
 * não se misturam: na Vila Madalena a casa sai ~R$ 10 mil/m² e o apartamento ~R$ 16 mil/m² —
 * misturados, toda casa parecia "50% abaixo" (corrigido em 13/10/26).
 */
export function grupoDoTipo(tipo: string | null): Grupo {
  if (tipo && /ALLOTMENT|LAND/i.test(tipo)) return "terreno";
  if (tipo && /HOME|HOUSE|CONDOMINIUM|VILLAGE/i.test(tipo)) return "casa";
  return "apartamento";
}

export function mediana(valores: number[]): number | null {
  const v = valores.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Abaixo disso a "média" do bairro ainda não é confiável pra comparar. */
export const AMOSTRA_MINIMA = 15;

export type Avaliacao = {
  oportunidade: boolean;
  motivo: string;
  pctAbaixo: number | null;
  referenciaM2: number | null;
};

export function avaliar(params: {
  precoM2: number | null;
  tetoM2: number | null;
  pctAbaixoMedia: number;
  mediaM2: number | null;
  palavras: string[];
}): Avaliacao {
  const { precoM2, tetoM2, pctAbaixoMedia, mediaM2, palavras } = params;
  const motivos: string[] = [];
  let pctAbaixo: number | null = null;

  if (precoM2 && mediaM2) pctAbaixo = Math.round((1 - precoM2 / mediaM2) * 100);

  if (precoM2 && tetoM2 && precoM2 <= tetoM2) {
    motivos.push(`R$/m² abaixo do teto do bairro (${Math.round(tetoM2)})`);
  } else if (precoM2 && !tetoM2 && pctAbaixo !== null && pctAbaixo >= pctAbaixoMedia) {
    motivos.push(`${pctAbaixo}% abaixo da média do bairro`);
  }
  if (palavras.length) motivos.push(`palavras: ${palavras.join(", ")}`);

  return {
    oportunidade: motivos.length > 0,
    motivo: motivos.join(" · "),
    pctAbaixo,
    referenciaM2: tetoM2 ?? mediaM2,
  };
}
