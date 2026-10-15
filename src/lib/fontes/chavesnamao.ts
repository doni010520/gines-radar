/**
 * Chaves na Mão (chavesnamao.com.br).
 *
 * Busca: a própria página de resultados (Next.js, App Router), em
 *   /imoveis-a-venda/<uf>-<cidade>/<bairro>/?filtro=or:6&pg=<n>
 * O HTML traz o "flight" do React Server Components (self.__next_f.push) e, dentro dele, um
 * objeto `dataBySegment` por card — já estruturado: id, url, preço (rawPrice), área útil/total,
 * tipo (realtyType.name), bairro, anunciante (publisher.name). 15 anúncios por página.
 * Preferido ao JSON-LD da página, que tem os mesmos 15 mas com tipo genérico e sem bairro limpo.
 *
 * Ordenação: `filtro=or:6` = MAIS RECENTES (ids decrescentes, criados no mesmo dia no topo).
 * Não aparece no menu do site (lá só or:0 relevância, or:1/2 preço, or:3/4 área) — achado
 * testando os valores. Se um dia parar de valer, o portal cai na relevância (or:0) sem erro:
 * conferir se o topo de or:6 ainda tem createdAt de hoje/ontem.
 * Data de criação (createdAt) só vem completa no 1º card de cada página; nos demais fica null.
 *
 * Bairro desconhecido: o portal responde 200 com "Página não encontrada" e sem cards → [].
 * Por garantia, descarta card cujo bairro não bate com o pedido (nunca devolve outro bairro).
 *
 * Descrição: página do anúncio, JSON-LD (@graph → RealEstateListing.description); se faltar,
 * o <p aria-label="descrição"> do HTML.
 *
 * Validado em 15/10/26.
 */
import { siglaUf } from "../estados";
import { baixar, HEADERS_NAVEGADOR, slug, textoDoHtml } from "./http";
import type { Anuncio, BairroBusca, Fonte } from "./tipos";

const BASE = "https://www.chavesnamao.com.br";

type CardBruto = {
  id?: number | string;
  title?: string;
  url?: string;
  transaction?: string;
  createdAt?: string;
  prices?: { rawPrice?: number | string };
  area?: { useful?: string; total?: string };
  realtyType?: { name?: string };
  publisher?: { name?: string };
  location?: { neighborhood?: { name?: string } };
};

/** Junta os pedaços do flight RSC (self.__next_f.push([1,"..."])) num texto só. */
function flight(html: string): string {
  const partes: string[] = [];
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)) {
    try {
      partes.push(JSON.parse(`"${m[1]}"`) as string);
    } catch {
      /* pedaço malformado: ignora */
    }
  }
  return partes.join("");
}

/** Lê o objeto JSON que começa em `inicio` (contando chaves, respeitando strings). */
function objetoEm(texto: string, inicio: number): unknown {
  if (texto[inicio] !== "{") return null;
  let nivel = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === "\\") i++;
      else if (c === '"') emString = false;
    } else if (c === '"') emString = true;
    else if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) {
      try {
        return JSON.parse(texto.slice(inicio, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** "1.100" → 1100; "45,5" → 45.5; "$undefined" → null. Abaixo de 10 m² é lixo de cadastro. */
function areaNum(v: string | undefined): number | null {
  if (!v || !/\d/.test(v)) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 10 ? n : null;
}

function precoNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const semAcento = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

/** realtyType.name do portal → vocabulário do radar. Comercial/rural → null. */
function tipoRadar(nome: string | undefined): string | null {
  const t = semAcento(nome ?? "");
  if (!t) return null;
  if (/comerci|loja|sala|predio|galpao|deposito|garagem|box|hotel|pousada|chacara|sitio|fazenda|haras|rural|industri|ponto/.test(t))
    return null;
  if (t.startsWith("terreno") || t.startsWith("lote")) return "RESIDENTIAL_ALLOTMENT_LAND";
  if (t.includes("cobertura")) return "PENTHOUSE";
  if (t.includes("condominio")) return "CONDOMINIUM";
  if (t.includes("vila")) return "VILLAGE_HOUSE";
  if (/apartamento|kitnet|studio|flat|loft|duplex|triplex|garden/.test(t)) return "APARTMENT";
  if (t === "sobrado") return "TWO_STORY_HOUSE";
  if (t.startsWith("casa") || t.includes("sobrado")) return "HOME";
  return null;
}

function normalizar(c: CardBruto): Anuncio {
  const tipo = tipoRadar(c.realtyType?.name);
  const util = areaNum(c.area?.useful);
  const total = areaNum(c.area?.total);
  // terreno: área do terreno (total); o resto: útil, e total se a útil não veio
  const area = tipo === "RESIDENTIAL_ALLOTMENT_LAND" ? total ?? util : util ?? total;
  const url = c.url ? new URL(c.url, BASE).href : "";
  // sem fuso no flight; o JSON-LD do anúncio publica o mesmo horário com "Z"
  const criado = c.createdAt ? new Date(`${c.createdAt.replace(/Z$/, "")}Z`) : null;
  return {
    id: `chavesnamao:${c.id}`,
    tipo,
    titulo: c.title ?? "",
    url,
    preco: precoNum(c.prices?.rawPrice),
    area,
    anunciante: c.publisher?.name?.trim() || null,
    criadoNoPortal: criado && !Number.isNaN(criado.getTime()) ? criado.toISOString() : null,
  };
}

function urlBusca(b: BairroBusca, pagina: number): string {
  const uf = siglaUf(b.estado).toLowerCase();
  return `${BASE}/imoveis-a-venda/${uf}-${slug(b.cidade)}/${slug(b.nome)}/?filtro=or:6&pg=${pagina + 1}`;
}

async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  const url = urlBusca(b, pagina);
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status === 404) return [];
  if (res.status !== 200) throw new Error(`Chaves na Mão busca ${res.status}: ${res.corpo.slice(0, 200)}`);

  const texto = flight(res.corpo);
  const alvo = slug(b.nome);
  const vistos = new Set<string>();
  const anuncios: Anuncio[] = [];
  for (const m of texto.matchAll(/"dataBySegment":/g)) {
    const c = objetoEm(texto, m.index! + m[0].length) as CardBruto | null;
    if (!c?.id || vistos.has(String(c.id))) continue;
    vistos.add(String(c.id));
    if (c.transaction && c.transaction !== "SELL") continue;
    // nunca devolver anúncio de outro bairro (fallback pra cidade, "imóveis próximos"...)
    if (slug(c.location?.neighborhood?.name ?? "") !== alvo) continue;
    anuncios.push(normalizar(c));
  }
  return anuncios;
}

type NoLd = { "@type"?: string | string[]; description?: string; "@graph"?: NoLd[] };

async function buscarDescricao(url: string): Promise<string> {
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status !== 200) throw new Error(`Chaves na Mão anúncio ${res.status}`);
  for (const m of res.corpo.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const json = JSON.parse(m[1]) as NoLd;
      const nos = json["@graph"] ?? [json];
      const anuncio = nos.find((n) => [n["@type"]].flat().includes("RealEstateListing"));
      if (anuncio?.description) return textoDoHtml(anuncio.description);
    } catch {
      /* bloco de JSON-LD inválido: tenta o próximo */
    }
  }
  const p = res.corpo.match(/aria-label="descrição"[^>]*>([\s\S]*?)<\/p>/);
  return p ? textoDoHtml(p[1]) : "";
}

export const chavesnamao: Fonte = {
  portal: "chavesnamao",
  nome: "Chaves na Mão",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: true,
  // 15 por página: 20 páginas ≈ 300 anúncios
  paginasAprendizado: 20,
  paginasNovos: 4,
};
