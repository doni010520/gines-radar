/**
 * Loft (loft.com.br) — cobre também o 123i, que hoje redireciona para a Loft.
 *
 * Busca: endpoint interno que a própria página de resultados chama (landscape-api, o mesmo que
 * o Next.js usa no servidor). Filtro de bairro é o "facet" "Bairro, Cidade, UF" — a API ignora
 * caixa e acento ("pinheiros, sao paulo, sp" = "Pinheiros, São Paulo, SP"); o slug da URL do
 * site ("pinheiros") NÃO funciona na API, devolve 0. Ordenação `mostRecent` = createdAt DESC,
 * então a varredura incremental pode parar na 1ª página com anúncio conhecido.
 * Cada item já vem com preço, área, tipo, imobiliária, createdAt e a DESCRIÇÃO COMPLETA (HTML);
 * a descrição fica em memória pra `buscarDescricao` não precisar baixar a página. Sem memória
 * (outro processo), sai do __NEXT_DATA__ da página do anúncio (/imovel/<id>, que redireciona
 * pra URL canônica).
 *
 * Página = 100 anúncios (a API aceita até 200, mas a resposta passa de 500 KB com descrições).
 * A busca traz também comercial (sala, loja, galpão): esses vêm com tipo null.
 *
 * Validado em 15/10/26. Se a Loft mudar o formato, é aqui que quebra.
 */
import { siglaUf } from "../estados";
import { baixar, HEADERS_NAVEGADOR, slug, textoDoHtml, UA } from "./http";
import type { Anuncio, BairroBusca, Fonte } from "./tipos";

const HEADERS_API = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Origin: "https://loft.com.br",
  Referer: "https://loft.com.br/",
};

const TAMANHO = 100;

type ListingBruto = {
  id: string;
  price?: number | null;
  area?: number | null;
  landArea?: string | number | null;
  homeType?: string | null; // apartment | house | land_lot | office | business | commercial_* ...
  propertyType?: string | null; // apartamento: default | studio | rooftop | garden | duplex ...
  realState?: string[] | null; // casa: house_standard | house_condominium
  usageType?: string | null;
  transactionType?: string | null;
  agencyName?: string | null;
  createdAt?: string | null;
  description?: string | null;
  bedrooms?: number | null;
  address?: {
    streetName?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    facets?: { neighborhood?: string | null };
  };
};

function numero(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Tipo da Loft → vocabulário do radar (null = comercial/rural/outros, ignorado). */
function tipo(l: ListingBruto): string | null {
  switch (l.homeType) {
    case "apartment":
      return l.propertyType === "rooftop" ? "PENTHOUSE" : "APARTMENT";
    case "house":
      return l.realState?.includes("house_condominium") ? "CONDOMINIUM" : "HOME";
    case "land_lot":
      return l.usageType === "commercial" ? null : "RESIDENTIAL_ALLOTMENT_LAND";
    default:
      return null;
  }
}

/** Descrições que vieram na busca, por id — evita baixar a página do anúncio. */
const descricoes = new Map<string, string>();
const MAX_DESCRICOES = 5000;

function guardarDescricao(id: string, html: string | null | undefined) {
  if (!html) return;
  if (descricoes.size >= MAX_DESCRICOES) descricoes.delete(descricoes.keys().next().value as string);
  descricoes.set(id, textoDoHtml(html));
}

const NOME_TIPO: Record<string, string> = {
  APARTMENT: "Apartamento",
  PENTHOUSE: "Cobertura",
  HOME: "Casa",
  CONDOMINIUM: "Casa de condomínio",
  RESIDENTIAL_ALLOTMENT_LAND: "Terreno",
};

function normalizar(l: ListingBruto): Anuncio {
  const t = tipo(l);
  // terreno: área do terreno; demais: área útil ("area")
  const area = t === "RESIDENTIAL_ALLOTMENT_LAND" ? numero(l.landArea) ?? numero(l.area) : numero(l.area) ?? numero(l.landArea);
  const quartos = l.bedrooms ? `, ${l.bedrooms} quarto${l.bedrooms > 1 ? "s" : ""}` : "";
  const titulo = [NOME_TIPO[t ?? ""] ?? "Imóvel", l.address?.streetName, l.address?.neighborhood].filter(Boolean).join(" · ") + (area ? `, ${area} m²` : "") + quartos;
  guardarDescricao(l.id, l.description);
  return {
    id: `loft:${l.id}`,
    tipo: t,
    titulo,
    url: `https://loft.com.br/imovel/${l.id}`,
    preco: numero(l.price),
    area,
    anunciante: l.agencyName ?? null,
    criadoNoPortal: l.createdAt ?? null,
  };
}

/** O Elasticsearch por trás só pagina até o 10.000º resultado (depois disso a API dá 500). */
const MAX_RESULTADOS = 10_000;

async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  if ((pagina + 1) * TAMANHO > MAX_RESULTADOS) return [];
  const uf = siglaUf(b.estado);
  const params = new URLSearchParams();
  params.append("neighborhood[]", `${b.nome}, ${b.cidade}, ${uf}`);
  params.append("transactionType[]", "for_sale");
  params.append("orderBy[]", "mostRecent");
  params.set("hitsPerPage", String(TAMANHO));
  params.set("page", String(pagina)); // 0 = primeira
  const res = await baixar(`https://landscape-api.loft.com.br/listing/search?${params}`, HEADERS_API);
  if (res.status !== 200) throw new Error(`Loft busca ${res.status}: ${res.corpo.slice(0, 200)}`);
  const json = JSON.parse(res.corpo) as { listings?: ListingBruto[]; pagination?: { totalPages?: number } };
  if (json.pagination?.totalPages !== undefined && pagina >= json.pagination.totalPages) return [];
  // a API casa o bairro sem acento/caixa; confere de novo pra nunca devolver outro bairro/cidade
  const alvoBairro = slug(b.nome);
  const alvoCidade = slug(b.cidade);
  return (json.listings ?? [])
    .filter(
      (l) =>
        slug(l.address?.neighborhood ?? "") === alvoBairro &&
        slug(l.address?.city ?? "") === alvoCidade &&
        (l.transactionType ?? "FOR_SALE").startsWith("FOR_SALE")
    )
    .map(normalizar);
}

async function buscarDescricao(url: string): Promise<string> {
  const id = url.replace(/\/+$/, "").split("/").pop() ?? "";
  const guardada = descricoes.get(id);
  if (guardada) return guardada;
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status !== 200) throw new Error(`Loft anúncio ${res.status}`);
  const m = res.corpo.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return "";
  type Dados = {
    props?: {
      initialReduxState?: { home?: { item?: { description?: string } } };
      pageProps?: { dehydratedState?: { queries?: { state?: { data?: { description?: unknown } } }[] } };
    };
  };
  const dados = JSON.parse(m[1]) as Dados;
  const html =
    dados.props?.initialReduxState?.home?.item?.description ??
    dados.props?.pageProps?.dehydratedState?.queries
      ?.map((q) => q.state?.data?.description)
      .find((d): d is string => typeof d === "string");
  return html ? textoDoHtml(html) : "";
}

export const loft: Fonte = {
  portal: "loft",
  nome: "Loft",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: true,
  paginasAprendizado: 3,
  paginasNovos: 3,
};
