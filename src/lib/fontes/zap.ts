/**
 * ZAP Imóveis (cobre também o VivaReal: mesmo banco de anúncios, mesmos ids — comparado em 14/10/26).
 *
 * Busca: endpoint interno que a própria página de resultados do site chama (glue-api). Devolve
 * preço, área, tipo e endereço já estruturados, ordenados pelos MAIS RECENTES — então cada
 * varredura só precisa ler o topo da lista até encontrar anúncio que já conhece.
 * Descrição: não vem na busca; sai da página do anúncio (data-testid="description-content").
 *
 * Validado em 06/10/26. Se o ZAP mudar o formato, é aqui que quebra — os erros caem em
 * radar_logs com a resposta crua pra ajustar.
 */
import { baixar, HEADERS_NAVEGADOR, textoDoHtml, UA } from "./http";
import type { Anuncio, BairroBusca, Fonte } from "./tipos";

const HEADERS_API = {
  "User-Agent": UA,
  "Accept-Language": "pt-BR,pt;q=0.9",
  "x-domain": ".zapimoveis.com.br",
  Origin: "https://www.zapimoveis.com.br",
  Referer: "https://www.zapimoveis.com.br/",
};

/** Máximo do ZAP: 30 por página (acima disso responde 400). */
const TAMANHO = 30;

type ListingBruto = {
  listing: {
    id: string;
    createdAt?: string;
    unitTypes?: string[];
    usableAreas?: number[];
    totalAreas?: number[];
    pricingInfos?: { businessType?: string; price?: number | string }[];
  };
  account?: { name?: string };
  link?: { name?: string; href?: string };
};

function primeiroNumero(v: unknown): number | null {
  const n = Array.isArray(v) ? Number(v[0]) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizar(item: ListingBruto): Anuncio {
  const l = item.listing;
  const venda = l.pricingInfos?.find((p) => p.businessType === "SALE") ?? l.pricingInfos?.[0];
  // terreno costuma vir só com área total; casa/apto com área útil
  const area = primeiroNumero(l.usableAreas) ?? primeiroNumero(l.totalAreas);
  return {
    id: `zap:${l.id}`,
    tipo: l.unitTypes?.[0] ?? null,
    titulo: item.link?.name ?? "",
    url: item.link?.href ? `https://www.zapimoveis.com.br${item.link.href}` : "",
    preco: primeiroNumero(venda?.price),
    area,
    anunciante: item.account?.name ?? null,
    criadoNoPortal: l.createdAt ?? null,
  };
}

/** Filtro de tipo na API é ignorado pelo ZAP — quem chama filtra. */
async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  const params = new URLSearchParams({
    business: "SALE",
    listingType: "USED",
    addressCity: b.cidade,
    addressState: b.estado,
    addressNeighborhood: b.nome,
    ...(b.zona ? { addressZone: b.zona } : {}),
    size: String(TAMANHO),
    from: String(pagina * TAMANHO),
    categoryPage: "RESULT",
    portal: "ZAP",
    sort: "createdAt DESC id ASC",
  });
  const res = await baixar(`https://glue-api.zapimoveis.com.br/v2/listings?${params}`, HEADERS_API);
  if (res.status !== 200) throw new Error(`ZAP busca ${res.status}: ${res.corpo.slice(0, 200)}`);
  const json = JSON.parse(res.corpo) as { search?: { result?: { listings?: ListingBruto[] } } };
  return (json.search?.result?.listings ?? []).map(normalizar);
}

async function buscarDescricao(url: string): Promise<string> {
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status !== 200) throw new Error(`ZAP anúncio ${res.status}`);
  const m = res.corpo.match(/data-testid="description-content"[^>]*>([\s\S]*?)<\/p>/);
  return m ? textoDoHtml(m[1]) : "";
}

export const zap: Fonte = {
  portal: "zap",
  nome: "ZAP",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: true,
  paginasAprendizado: 10,
  paginasNovos: 5,
};
