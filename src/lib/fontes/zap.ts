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
import type { Anuncio, BairroBusca, Fonte, Variante } from "./tipos";

const HEADERS_API = {
  "User-Agent": UA,
  "Accept-Language": "pt-BR,pt;q=0.9",
  "x-domain": ".zapimoveis.com.br",
  Origin: "https://www.zapimoveis.com.br",
  Referer: "https://www.zapimoveis.com.br/",
};

/** Máximo do ZAP: 30 por página (acima disso responde 400). */
const TAMANHO = 30;

/**
 * Filtro de tipo do ZAP: só funciona com a combinação completa (unitTypes + unitTypesV3 +
 * unitSubTypes + usageTypes) e um grupo por vez — pedindo dois, ele aplica só o primeiro
 * (testado em 23/10/26). Cada grupo vira uma variante da busca.
 */
const GRUPOS_ZAP: { chave: string; tipos: string[]; filtro: Record<string, string> }[] = [
  // "casas" inclui sobrado (vem como HOME com subtipo TWO_STORY_HOUSE)
  { chave: "casa", tipos: ["HOME", "TWO_STORY_HOUSE"], filtro: { unitTypes: "HOME", unitTypesV3: "HOME", unitSubTypes: "UnitSubType_NONE,SINGLE_STOREY_HOUSE,KITNET" } },
  { chave: "condominio", tipos: ["CONDOMINIUM"], filtro: { unitTypes: "HOME", unitTypesV3: "CONDOMINIUM", unitSubTypes: "CONDOMINIUM" } },
  { chave: "vila", tipos: ["VILLAGE_HOUSE"], filtro: { unitTypes: "HOME", unitTypesV3: "VILLAGE_HOUSE", unitSubTypes: "VILLAGE_HOUSE" } },
  {
    chave: "terreno",
    tipos: ["RESIDENTIAL_ALLOTMENT_LAND"],
    filtro: { unitTypes: "ALLOTMENT_LAND", unitTypesV3: "RESIDENTIAL_ALLOTMENT_LAND", unitSubTypes: "UnitSubType_NONE,CONDOMINIUM,VILLAGE" },
  },
  { chave: "apartamento", tipos: ["APARTMENT"], filtro: { unitTypes: "APARTMENT", unitTypesV3: "APARTMENT", unitSubTypes: "UnitSubType_NONE,DUPLEX,TRIPLEX" } },
  { chave: "cobertura", tipos: ["PENTHOUSE"], filtro: { unitTypes: "APARTMENT", unitTypesV3: "PENTHOUSE", unitSubTypes: "PENTHOUSE" } },
];

/** Uma variante por grupo que tenha algum tipo marcado no bairro. */
function variantes(tiposDoBairro: string[]): Variante[] {
  return GRUPOS_ZAP.filter((g) => g.tipos.some((t) => tiposDoBairro.includes(t))).map((g) => ({ chave: g.chave, tipos: g.tipos }));
}

type ListingBruto = {
  listing: {
    id: string;
    createdAt?: string;
    unitTypes?: string[];
    unitSubTypes?: string[];
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
    // sobrado vem como HOME + subtipo; terreno às vezes como ALLOTMENT_LAND genérico
    tipo: l.unitSubTypes?.includes("TWO_STORY_HOUSE")
      ? "TWO_STORY_HOUSE"
      : l.unitTypes?.[0] === "ALLOTMENT_LAND"
        ? "RESIDENTIAL_ALLOTMENT_LAND"
        : (l.unitTypes?.[0] ?? null),
    titulo: item.link?.name ?? "",
    url: item.link?.href ? `https://www.zapimoveis.com.br${item.link.href}` : "",
    preco: primeiroNumero(venda?.price),
    area,
    anunciante: item.account?.name ?? null,
    criadoNoPortal: l.createdAt ?? null,
  };
}

async function buscarPagina(b: BairroBusca, pagina: number, variante?: Variante): Promise<Anuncio[]> {
  const grupo = variante ? GRUPOS_ZAP.find((g) => g.chave === variante.chave) : undefined;
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
    ...(grupo ? { usageTypes: "RESIDENTIAL", ...grupo.filtro } : {}),
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
  variantes,
  ordenadoPorRecentes: true,
  paginasAprendizado: 10,
  paginasNovos: 5,
};
