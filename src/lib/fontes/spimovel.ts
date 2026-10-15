/**
 * SP Imóvel (spimovel.com.br) — portal multi-imobiliária do Grupo SP Imóvel. Só cobre a Grande
 * São Paulo e o litoral paulista (cidades da lista /Json/ImovelCidade/); fora disso devolve [].
 *
 * A URL "bonita" por bairro não existe (/imoveis/venda/sao-paulo/sao-paulo/pinheiros/ dá 404): a
 * busca do site usa ids. Por isso:
 *  1. cidade → id: GET /Json/ImovelCidade/ (mesma chamada do formulário de busca);
 *  2. bairro → id: POST /Json/ImovelBairro/ com o id da cidade;
 *  3. anúncios: GET /Imovel/JsGetListaImovelPaginacao — o endpoint que a lista de resultados
 *     chama ao trocar de página; devolve JSON com preço (Valor), área útil, tipo, bairro,
 *     imobiliária e URL. OrderByOption=13 = "Mais Recentes" (na prática ImovelId decrescente).
 * 15 anúncios por página + destaques pagos intercalados (Destaque/SuperDestaque, fora de ordem e
 * repetidos) — esses são descartados pra ordem por recentes valer. Depois da última página o site
 * passa a devolver "bairros próximos" (RegCount = 0): tratado como fim. Item de outro bairro é
 * sempre descartado.
 * Data de cadastro não é publicada (o "Data" do JSON é de atualização) → criadoNoPortal null.
 * Descrição: página do anúncio, bloco "descricao-anuncio".
 *
 * Validado em 15/10/26. Se o SP Imóvel mudar o formato, é aqui que quebra.
 */
import { baixar, HEADERS_NAVEGADOR, slug, textoDoHtml, UA } from "./http";
import type { Anuncio, BairroBusca, Fonte } from "./tipos";

const BASE = "https://www.spimovel.com.br";
/** FilialId 8 = portal SP Imóvel (aparece em todo filtro do site). */
const FILIAL = "8";

const HEADERS_API = {
  "User-Agent": UA,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${BASE}/imoveis/`,
};

type ItemId = { Id: string; Descricao: string };

type ImovelBruto = {
  ImovelId: number;
  BairroId?: number;
  Bairro?: string | null;
  Cidade?: string | null;
  Tipo?: string | null;
  Valor?: number | null;
  AreaUtil?: number | null;
  Dorm?: string | null;
  Imobiliaria?: string | null;
  Url?: string | null;
  Destaque?: boolean;
  SuperDestaque?: boolean;
  RegCount?: number;
};

const TIPOS: Record<string, string> = {
  apartamento: "APARTMENT",
  "apartamento-duplex": "APARTMENT",
  "studio-flat": "APARTMENT",
  "kitnet-loft": "APARTMENT",
  cobertura: "PENTHOUSE",
  sobrado: "TWO_STORY_HOUSE",
  "casa-terrea": "HOME",
  "condominio-fechado": "CONDOMINIUM",
  terreno: "RESIDENTIAL_ALLOTMENT_LAND",
};

let cidades: Promise<ItemId[]> | null = null;
const bairrosPorCidade = new Map<string, Promise<ItemId[]>>();

async function json<T>(url: string, corpo?: string): Promise<T> {
  const headers = corpo ? { ...HEADERS_API, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : HEADERS_API;
  const res = await baixar(url, headers, corpo ? { metodo: "POST", corpo } : {});
  if (res.status !== 200) throw new Error(`SP Imóvel ${url.replace(BASE, "")} ${res.status}: ${res.corpo.slice(0, 200)}`);
  return JSON.parse(res.corpo) as T;
}

const FILTRO_BASE = { PorSPImovel: "1", FilialId: FILIAL, ImobiliariaId: "0", FinalidadeId: "1", CategoriaId: "", TipoIds: "", PrecoDe: "", PrecoAte: "" };

function listaCidades(): Promise<ItemId[]> {
  cidades ??= json<ItemId[]>(`${BASE}/Json/ImovelCidade/?${new URLSearchParams(FILTRO_BASE)}`).catch((err) => {
    cidades = null; // não guarda falha
    throw err;
  });
  return cidades;
}

function listaBairros(cidadeId: string): Promise<ItemId[]> {
  let p = bairrosPorCidade.get(cidadeId);
  if (!p) {
    p = json<ItemId[]>(`${BASE}/Json/ImovelBairro/`, String(new URLSearchParams({ ...FILTRO_BASE, CidadeIds: cidadeId }))).catch((err) => {
      bairrosPorCidade.delete(cidadeId);
      throw err;
    });
    bairrosPorCidade.set(cidadeId, p);
  }
  return p;
}

/** Ids de cidade e bairro no SP Imóvel; null = o portal não tem esse bairro. */
async function ids(b: BairroBusca): Promise<{ cidade: string; bairro: string } | null> {
  if (slug(b.estado) !== "sao-paulo") return null;
  const cidade = (await listaCidades()).find((c) => slug(c.Descricao) === slug(b.cidade));
  if (!cidade) return null;
  const bairro = (await listaBairros(cidade.Id)).find((x) => slug(x.Descricao) === slug(b.nome));
  return bairro ? { cidade: cidade.Id, bairro: bairro.Id } : null;
}

function normalizar(i: ImovelBruto): Anuncio {
  const tipo = TIPOS[slug(i.Tipo ?? "")] ?? null;
  const area = i.AreaUtil && i.AreaUtil > 0 ? i.AreaUtil : null;
  const dorm = Number(i.Dorm);
  const titulo = [i.Tipo, dorm > 0 ? `${dorm} quarto${dorm > 1 ? "s" : ""}` : "", area ? `${area} m²` : "", i.Bairro]
    .filter(Boolean)
    .join(" · ");
  return {
    id: `spimovel:${i.ImovelId}`,
    tipo,
    titulo,
    url: i.Url ? new URL(i.Url, BASE).href : `${BASE}/imovel/x/${i.ImovelId}/`,
    preco: i.Valor && i.Valor > 0 ? i.Valor : null,
    area,
    anunciante: i.Imobiliaria ?? null,
    criadoNoPortal: null,
  };
}

async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  const id = await ids(b);
  if (!id) return [];
  const filtro =
    `?FilialId=${FILIAL}&FinalidadeId=1&BairroId=${id.bairro}&BairroIds=${id.bairro}&CidadeIds=${id.cidade}` +
    `&OrderByOption=13&TirarBairroProximo=True&BairroExato=True&PrioridadeTopo=False`;
  const params = new URLSearchParams({ pageNumber: String(pagina + 1), paramStr: filtro });
  const lista = await json<ImovelBruto[] | "">(`${BASE}/Imovel/JsGetListaImovelPaginacao?${params}`);
  if (!Array.isArray(lista) || !lista.length || !lista[0].RegCount) return [];
  const vistos = new Set<number>();
  return lista
    .filter((i) => !i.Destaque && !i.SuperDestaque && String(i.BairroId) === id.bairro)
    .filter((i) => !vistos.has(i.ImovelId) && vistos.add(i.ImovelId))
    .map(normalizar);
}

async function buscarDescricao(url: string): Promise<string> {
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status !== 200) throw new Error(`SP Imóvel anúncio ${res.status}`);
  const m = res.corpo.match(/class="descricao-anuncio"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/);
  return m ? textoDoHtml(m[1]) : "";
}

export const spimovel: Fonte = {
  portal: "spimovel",
  nome: "SP Imóvel",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: true,
  paginasAprendizado: 20,
  paginasNovos: 5,
  // robots.txt do SP Imóvel pede Crawl-delay: 4
  pausaMs: 4000,
  descricoesEmParalelo: 1,
};
