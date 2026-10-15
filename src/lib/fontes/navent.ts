/**
 * Portais da plataforma Navent / Grupo QuintoAndar: Wimóveis (DF), Casa Mineira (MG) e Imovelweb
 * (nacional). Os três rodam o mesmo front ("RPLIS"), então uma implementação só serve pros três —
 * muda o domínio e o formato da URL do bairro.
 *
 * Busca em dois passos:
 *  1. Página HTML do bairro (uma vez por bairro, fica em memória) só pra descobrir o id interno da
 *     localização (`valueZone`) em window.__PRELOADED_STATE__. Bairro que o portal não conhece
 *     redireciona pra cidade/estado — aí o nome não bate e a fonte devolve [] (nada de anúncio de
 *     outro bairro).
 *  2. Endpoint interno que o próprio site chama ao trocar de página/ordenação:
 *     POST /rplis-api/postings {valueZone, tipoDeOperacion: "1" (venda), sort: "more_recent", pagina}.
 *     30 anúncios por página, já estruturados (preço, área útil/total, tipo, anunciante, bairro).
 *     "more_recent" segue a data de (re)publicação que o site mostra ("Publicado há X dias").
 *     Página além da última o portal devolve a última de novo — por isso confere currentPage.
 * Cada anúncio ainda é conferido pela localização (bairro + cidade + UF): a lista mistura um ou
 * outro destaque/lançamento de bairro vizinho. Lançamentos (postingType DEVELOPMENT, sem preço
 * próprio) ficam de fora.
 * Tipo: o portal só diz Apartamento/Casa/Terreno/Lote...; cobertura, sobrado e casa de condomínio
 * saem do título.
 * Data de criação não vem na listagem (só na página do anúncio) — criadoNoPortal fica null.
 * Descrição: página do anúncio, <div class="section-description">.
 *
 * Obs.: Wimóveis e Imovelweb compartilham o banco — no DF os mesmos ids aparecem nos dois.
 *
 * Validado em 15/10/26 pelo proxy residencial (Imovelweb também respondeu 200 nesse dia).
 */
import { siglaUf } from "../estados";
import { baixar, HEADERS_NAVEGADOR, slug, textoDoHtml, UA } from "./http";
import type { Anuncio, BairroBusca, Fonte, TipoImovel } from "./tipos";

type Config = {
  portal: string;
  nome: string;
  host: string; // "www.wimoveis.com.br"
  /** UFs atendidas (vazio = todas); fora delas buscarPagina devolve [] sem requisição */
  ufs: string[];
  /** caminho da página de venda do bairro, com o slug do portal */
  caminhoBairro(bairro: string, cidade: string, uf: string): string;
};

type Local = { id: string; tipo: string; nome: string };

type LocalizacaoBruta = { name?: string; label?: string; depth?: number; acronym?: string | null; parent?: LocalizacaoBruta | null };

type PostingBruto = {
  postingId: string;
  title?: string;
  generatedTitle?: string;
  url?: string;
  postingType?: string;
  realEstateType?: { name?: string; realEstateTypeId?: string };
  priceOperationTypes?: { operationType?: { operationTypeId?: string }; prices?: { amount?: number | null; currency?: string; currencyId?: string }[] }[];
  mainFeatures?: Record<string, { value?: string | null }>;
  publisher?: { name?: string | null } | null;
  postingLocation?: { location?: LocalizacaoBruta | null } | null;
};

type RespostaApi = { paging?: { currentPage?: number; totalPages?: number }; listPostings?: PostingBruto[] };

/** O JSON que vem depois de `marcador` no HTML (window.__PRELOADED_STATE__ = {...}). */
function extrairJson(html: string, marcador: string): unknown {
  const i = html.indexOf(marcador);
  if (i < 0) return null;
  const ini = html.indexOf("{", i);
  let nivel = 0;
  let emTexto = false;
  let escape = false;
  for (let e = ini; e < html.length; e++) {
    const c = html[e];
    if (emTexto) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') emTexto = false;
    } else if (c === '"') emTexto = true;
    else if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) return JSON.parse(html.slice(ini, e + 1));
  }
  return null;
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Tipo do portal → vocabulário do radar. Subtipo não vem estruturado: sai do título. */
function tipoDe(p: PostingBruto): TipoImovel | null {
  const id = p.realEstateType?.realEstateTypeId;
  const nome = slug(p.realEstateType?.name ?? "");
  const titulo = slug(`${p.title ?? ""} ${p.generatedTitle ?? ""}`);
  if (id === "2" || nome.startsWith("apartamento")) return /cobertura/.test(titulo) ? "PENTHOUSE" : "APARTMENT";
  if (id === "1" || nome.startsWith("casa")) {
    if (/sobrado/.test(titulo)) return "TWO_STORY_HOUSE";
    if (/condominio/.test(titulo)) return "CONDOMINIUM";
    return "HOME";
  }
  if (id === "1003" || id === "40" || nome.startsWith("terreno") || nome.startsWith("lote")) return "RESIDENTIAL_ALLOTMENT_LAND";
  return null; // comercial, rural, galpão...
}

/** O anúncio é mesmo do bairro/cidade/UF pedidos? (a lista traz destaque de bairro vizinho) */
function doBairro(loc: LocalizacaoBruta | null | undefined, b: BairroBusca, uf: string): boolean {
  let bairro = false;
  let cidade = false;
  let estado = false;
  for (let n = loc; n; n = n.parent) {
    const s = slug(n.name ?? "");
    if ((n.depth ?? 0) >= 3 && s === slug(b.nome)) bairro = true;
    if (n.label === "CIUDAD" && s === slug(b.cidade)) cidade = true;
    if (n.label === "PROVINCIA" && n.acronym?.toUpperCase() === uf) estado = true;
  }
  return bairro && cidade && estado;
}

function criarFonte(cfg: Config): Fonte {
  const base = `https://${cfg.host}`;
  const locais = new Map<string, Promise<Local | null>>();

  /** id interno do bairro, lido da página HTML (null = portal não conhece o bairro). */
  async function resolverLocal(b: BairroBusca, uf: string): Promise<Local | null> {
    const url = base + cfg.caminhoBairro(slug(b.nome), slug(b.cidade), uf.toLowerCase());
    const res = await baixar(url, HEADERS_NAVEGADOR);
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`${cfg.nome} página do bairro ${res.status}: ${res.corpo.slice(0, 200)}`);
    const estado = extrairJson(res.corpo, "window.__PRELOADED_STATE__") as {
      listStore?: { appliedFilters?: { type?: string; options?: { label?: string; type?: string; min?: string }[] }[] };
    } | null;
    if (!estado) throw new Error(`${cfg.nome} página do bairro sem __PRELOADED_STATE__: ${res.corpo.slice(0, 200)}`);
    const op = estado.listStore?.appliedFilters?.find((f) => f.type === "location")?.options?.[0];
    // bairro desconhecido cai na cidade/estado: o nome do filtro aplicado não bate
    if (!op?.min || !op.type || slug(op.label ?? "") !== slug(b.nome)) return null;
    return { id: op.min, tipo: op.type, nome: op.label ?? b.nome };
  }

  function local(b: BairroBusca, uf: string): Promise<Local | null> {
    const chave = `${uf}|${slug(b.cidade)}|${slug(b.nome)}`;
    let p = locais.get(chave);
    if (!p) {
      p = resolverLocal(b, uf);
      locais.set(chave, p);
      p.catch(() => locais.delete(chave)); // erro de rede não fica guardado
    }
    return p;
  }

  function normalizar(p: PostingBruto): Anuncio {
    const venda = p.priceOperationTypes?.find((o) => o.operationType?.operationTypeId === "1");
    const preco = venda?.prices?.find((x) => x.currency === "R$" || x.currencyId === "3");
    const f = p.mainFeatures ?? {};
    const util = numero(f.CFT101?.value); // área útil
    const total = numero(f.CFT100?.value); // área total
    const tipo = tipoDe(p);
    return {
      id: `${cfg.portal}:${p.postingId}`,
      tipo,
      titulo: p.title?.trim() || p.generatedTitle || "",
      url: p.url ? new URL(p.url, base).href : "",
      preco: numero(preco?.amount),
      area: tipo === "RESIDENTIAL_ALLOTMENT_LAND" ? total ?? util : util ?? total,
      anunciante: p.publisher?.name?.trim() || null,
      criadoNoPortal: null,
    };
  }

  async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
    const uf = siglaUf(b.estado).toUpperCase();
    if (cfg.ufs.length && !cfg.ufs.includes(uf)) return [];
    const loc = await local(b, uf);
    if (!loc) return [];
    const referer = base + cfg.caminhoBairro(slug(b.nome), slug(b.cidade), uf.toLowerCase());
    const res = await baixar(
      `${base}/rplis-api/postings`,
      {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        Origin: base,
        Referer: referer,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      {
        metodo: "POST",
        corpo: JSON.stringify({ [loc.tipo]: loc.id, tipoDeOperacion: "1", sort: "more_recent", pagina: pagina + 1 }),
      }
    );
    if (res.status !== 200) throw new Error(`${cfg.nome} busca ${res.status}: ${res.corpo.slice(0, 200)}`);
    const json = JSON.parse(res.corpo) as RespostaApi;
    // além da última página o portal repete a última
    if (json.paging?.currentPage !== pagina + 1) return [];
    return (json.listPostings ?? [])
      .filter((p) => p.postingType !== "DEVELOPMENT" && doBairro(p.postingLocation?.location, b, uf))
      .map(normalizar);
  }

  async function buscarDescricao(url: string): Promise<string> {
    const res = await baixar(url, HEADERS_NAVEGADOR);
    if (res.status !== 200) throw new Error(`${cfg.nome} anúncio ${res.status}`);
    const m = res.corpo.match(/class="section-description"[^>]*>([\s\S]*?)<\/div>/);
    return m ? textoDoHtml(m[1]) : "";
  }

  return {
    portal: cfg.portal,
    nome: cfg.nome,
    buscarPagina,
    buscarDescricao,
    ordenadoPorRecentes: true,
    paginasAprendizado: 10, // 30 por página → ~300 anúncios
    paginasNovos: 4,
  };
}

/** Wimóveis: só DF. /venda/imoveis/df/brasilia/asa-sul */
export const wimoveis: Fonte = criarFonte({
  portal: "wimoveis",
  nome: "Wimóveis",
  host: "www.wimoveis.com.br",
  ufs: ["DF"],
  caminhoBairro: (bairro, cidade, uf) => `/venda/imoveis/${uf}/${cidade}/${bairro}`,
});

/** Casa Mineira: só MG. /venda/imovel/savassi_belo-horizonte_mg */
export const casamineira: Fonte = criarFonte({
  portal: "casamineira",
  nome: "Casa Mineira",
  host: "www.casamineira.com.br",
  ufs: ["MG"],
  caminhoBairro: (bairro, cidade, uf) => `/venda/imovel/${bairro}_${cidade}_${uf}`,
});

/**
 * Imovelweb: nacional. URL do bairro não leva UF (/imoveis-venda-pinheiros-sao-paulo.html) —
 * cidade homônima em outro estado é barrada na conferência de UF de cada anúncio.
 */
export const imovelweb: Fonte = criarFonte({
  portal: "imovelweb",
  nome: "Imovelweb",
  host: "www.imovelweb.com.br",
  ufs: [],
  caminhoBairro: (bairro, cidade) => `/imoveis-venda-${bairro}-${cidade}.html`,
});
