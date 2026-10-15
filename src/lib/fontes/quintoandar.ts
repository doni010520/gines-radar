/**
 * QuintoAndar (venda — /comprar).
 *
 * Busca: endpoint interno que a própria página de resultados do site chama
 * (POST apigw.prod.quintoandar.com.br/house-listing-search/v3/search/list, JSON no corpo, sem
 * login). O bairro vai pelo slug da URL pública ("vila-madalena-sao-paulo-sp-brasil"); a resposta
 * traz preço de venda, área, tipo e bairro já estruturados. Ordenação MOST_RECENT = data da
 * última publicação, decrescente (conferido abrindo anúncios das posições 1 a 170 em 15/10/26) —
 * anúncio antigo republicado volta pro topo, mas a lista é por data.
 * Bairro que o QuintoAndar não reconhece cai na cidade inteira (locationContext "CITY"): aí
 * devolvemos [] — e, por garantia, cada anúncio ainda é filtrado pelo bairro/cidade dele.
 * Descrição: não vem na busca; sai do __NEXT_DATA__ da página do anúncio (houseInfo.remarks, o
 * texto do proprietário; se vazio, a descrição gerada pelo próprio portal).
 * Data: a busca não informa — criadoNoPortal fica null.
 *
 * Validado em 15/10/26. Se o QuintoAndar mudar o formato, é aqui que quebra.
 */
import { siglaUf } from "../estados";
import { baixar, HEADERS_NAVEGADOR, slug, textoDoHtml, UA } from "./http";
import type { Anuncio, BairroBusca, Fonte } from "./tipos";

const API = "https://apigw.prod.quintoandar.com.br/house-listing-search/v3/search/list";
const SITE = "https://www.quintoandar.com.br";

const HEADERS_API = {
  "User-Agent": UA,
  Accept: "application/json",
  "Content-Type": "application/json",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Origin: SITE,
  Referer: `${SITE}/`,
};

/** O site pede 60 por vez; a API aceita mais, mas não precisa. */
const TAMANHO = 60;

const CAMPOS = ["id", "salePrice", "area", "type", "forSale", "neighbourhood", "regionName", "city", "address", "shortSaleDescription"];

/** Tipos do QuintoAndar → vocabulário do radar. Studio/kitnet conta como apartamento, como nas outras fontes. */
const TIPOS: Record<string, string> = {
  Apartamento: "APARTMENT",
  StudioOuKitchenette: "APARTMENT",
  Casa: "HOME",
  CasaCondominio: "CONDOMINIUM",
  Cobertura: "PENTHOUSE",
};

type HitBruto = {
  _id: string;
  _source: {
    id?: number;
    salePrice?: number;
    area?: number;
    type?: string;
    forSale?: boolean;
    neighbourhood?: string;
    regionName?: string;
    city?: string;
    address?: string;
    shortSaleDescription?: string;
  };
};

type RespostaBusca = {
  hits?: { hits?: HitBruto[] };
  locationInfo?: { locations?: { locationContext?: string }[] };
};

function numero(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const NOMES_TIPO: Record<string, string> = {
  Apartamento: "Apartamento",
  Casa: "Casa",
  CasaCondominio: "Casa em condomínio",
  StudioOuKitchenette: "Studio",
};

function normalizar(h: HitBruto): Anuncio {
  const s = h._source;
  const id = String(s.id ?? h._id);
  const tipoQA = s.type ?? "";
  const bairro = s.neighbourhood ?? s.regionName ?? "";
  const titulo = [NOMES_TIPO[tipoQA] ?? tipoQA, s.area ? `${s.area} m²` : "", s.address, bairro].filter(Boolean).join(" · ");
  return {
    id: `quintoandar:${id}`,
    tipo: TIPOS[tipoQA] ?? null,
    titulo,
    url: `${SITE}/imovel/${id}/comprar`,
    preco: numero(s.salePrice),
    area: numero(s.area),
    anunciante: "QuintoAndar",
    criadoNoPortal: null,
  };
}

async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  const local = `${slug(b.nome)}-${slug(b.cidade)}-${slug(siglaUf(b.estado))}-brasil`;
  const corpo = {
    context: { isSSR: false },
    filters: { businessContext: "SALE", isExactSearch: true },
    location: { countryCode: "BR" },
    sorting: { criteria: "MOST_RECENT", order: "DESC" },
    pagination: { pageSize: TAMANHO, offset: pagina * TAMANHO },
    fields: CAMPOS,
    slug: local,
    locationDescriptions: [{ description: local }],
  };
  const res = await baixar(API, HEADERS_API, { metodo: "POST", corpo: JSON.stringify(corpo) });
  if (res.status !== 200) throw new Error(`QuintoAndar busca ${res.status}: ${res.corpo.slice(0, 200)}`);
  const json = JSON.parse(res.corpo) as RespostaBusca;

  // bairro desconhecido → o portal busca na cidade inteira; não serve pra média do bairro
  const contexto = json.locationInfo?.locations?.[0]?.locationContext;
  if (contexto && contexto !== "NEIGHBORHOOD") return [];

  const alvoBairro = slug(b.nome);
  const alvoCidade = slug(b.cidade);
  return (json.hits?.hits ?? [])
    .filter((h) => h._source.forSale !== false)
    .filter((h) => slug(h._source.neighbourhood ?? h._source.regionName ?? "") === alvoBairro)
    .filter((h) => !h._source.city || slug(h._source.city) === alvoCidade)
    .map(normalizar);
}

async function buscarDescricao(url: string): Promise<string> {
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status !== 200) throw new Error(`QuintoAndar anúncio ${res.status}`);
  const m = res.corpo.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return "";
  const dados = JSON.parse(m[1]) as {
    props?: {
      pageProps?: {
        initialState?: {
          house?: { houseInfo?: { remarks?: string; generatedDescription?: { longDescription?: string } } };
        };
      };
    };
  };
  const info = dados.props?.pageProps?.initialState?.house?.houseInfo;
  const texto = info?.remarks?.trim() || info?.generatedDescription?.longDescription?.trim() || "";
  return textoDoHtml(texto);
}

export const quintoandar: Fonte = {
  portal: "quintoandar",
  nome: "QuintoAndar",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: true,
  paginasAprendizado: 5,
  paginasNovos: 3,
};
