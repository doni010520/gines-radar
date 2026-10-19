/**
 * OLX Imóveis (olx.com.br).
 *
 * Acesso: a OLX barra curl e navegador invisível (403 da Cloudflare) — as páginas saem do
 * navegador de verdade (navegador.ts). Cada página de busca pesa ~1,1 MB e leva ~10–15 s, então
 * o volume é baixo de propósito (4 páginas no aprendizado, uma página aberta por vez).
 *
 * Bairro → URL: o caminho tem um segmento de região que não sai do nome
 * (estado-ba/grande-salvador/salvador/pituba, estado-sp/sao-paulo-e-regiao/zona-oeste/pinheiros).
 * Vem do autocompletar de localização que o próprio site usa
 * (location-autocomplete.olx.com.br/v2/location?q=...) — esse endpoint aceita curl (baixar()).
 * Só servem resultados de bairro (filters.sd_id) com o mesmo nome, a mesma UF e a cidade certa
 * (no subtítulo "Em Salvador, ..." ou, nas capitais divididas em zonas, a região
 * "sao-paulo-e-regiao"). O caminho resolvido fica em memória por bairro.
 *
 * Busca: /imoveis/venda/<caminho>?sf=1&o=N (sf=1 = "Mais recentes"; o=N, N a partir de 1;
 * 50 por página). "venda" = categoria 1001 (casas e apartamentos) — terrenos ficam de fora.
 * Os dados NÃO estão no __NEXT_DATA__: a página é do app router e os anúncios vêm no payload
 * RSC (self.__next_f.push) como `"ads":[{listId, priceValue, properties[size, real_estate_type,
 * re_types], url, date, locationDetails{municipality, neighbourhood}, professionalAd,
 * olxPay.transactionalSellerName}]`. Cada anúncio é conferido pelo bairro/cidade de
 * locationDetails.
 * Ordem: "mais recentes" é pela data da última publicação — anúncio antigo republicado volta pro
 * topo (listId velho com data de hoje). Por isso ordenadoPorRecentes = false: parar no 1º
 * conhecido faria perder os novos que estão abaixo dos republicados; lemos sempre
 * `paginasNovos` páginas. Pelo mesmo motivo criadoNoPortal é a data da última publicação.
 * Descrição: application/ld+json da página do anúncio (Object.description, completa, com <br>).
 *
 * Validado em 15/10/26 (Pituba e Barra/Salvador, Pinheiros/São Paulo).
 */
import { siglaUf } from "../estados";
import { baixar, slug, textoDoHtml, UA } from "./http";
import { abrirPagina } from "./navegador";
import type { Anuncio, BairroBusca, Fonte, TipoImovel } from "./tipos";

const BASE = "https://www.olx.com.br";

type LocalBruto = {
  title?: string;
  subtitle?: string;
  path?: string;
  uf?: string;
  filters?: { sd_id?: string; zone?: string };
};

type AnuncioBruto = {
  listId?: number;
  subject?: string;
  priceValue?: string;
  price?: string;
  url?: string;
  date?: number;
  category?: string;
  categoryName?: string;
  professionalAd?: boolean;
  properties?: { name?: string; value?: string }[];
  locationDetails?: { municipality?: string; neighbourhood?: string; uf?: string };
  olxPay?: { transactionalSellerName?: string | null } | null;
};

// ---------- bairro → caminho da URL ----------

const caminhos = new Map<string, Promise<string | null>>();

const chave = (b: BairroBusca) => `${slug(b.nome)}|${slug(b.cidade)}|${siglaUf(b.estado)}`;

async function autocompletar(q: string): Promise<LocalBruto[]> {
  const res = await baixar(`https://location-autocomplete.olx.com.br/v2/location?q=${encodeURIComponent(q)}`, {
    "User-Agent": UA,
    Accept: "application/json",
    "Accept-Language": "pt-BR,pt;q=0.9",
    Origin: BASE,
    Referer: `${BASE}/`,
  });
  if (res.status !== 200) throw new Error(`OLX localização ${res.status}: ${res.corpo.slice(0, 200)}`);
  const j = JSON.parse(res.corpo) as unknown;
  return Array.isArray(j) ? (j as LocalBruto[]) : [];
}

/** 2 = cidade no subtítulo ("Em Salvador, DDD 71"); 1 = capital com zonas ("sao-paulo-e-regiao/zona-oeste"). */
function nota(l: LocalBruto, b: BairroBusca): number {
  if (!l.filters?.sd_id || !l.path) return 0;
  if ((l.uf ?? "").toUpperCase() !== siglaUf(b.estado).toUpperCase()) return 0;
  if (slug(l.title ?? "") !== slug(b.nome)) return 0;
  const cidade = slug(b.cidade);
  const emCidade = /^Em ([^,]+),/.exec(l.subtitle ?? "")?.[1];
  if (emCidade && slug(emCidade) === cidade) return 2;
  const seg = l.path.split("/");
  if (seg.length >= 4 && seg[1] === `${cidade}-e-regiao`) return 1;
  return 0;
}

async function resolverCaminho(b: BairroBusca): Promise<string | null> {
  for (const q of [`${b.nome} ${b.cidade}`, b.nome]) {
    const melhor = (await autocompletar(q))
      .map((l) => ({ l, n: nota(l, b) }))
      .filter((x) => x.n > 0)
      .sort((a, c) => c.n - a.n)[0];
    if (melhor) return melhor.l.path!.replace(/^\/+/, "");
  }
  return null;
}

function caminhoDoBairro(b: BairroBusca): Promise<string | null> {
  const k = chave(b);
  let p = caminhos.get(k);
  if (!p) {
    p = resolverCaminho(b);
    caminhos.set(k, p);
    p.catch(() => caminhos.delete(k)); // erro de rede não fica em cache
  }
  return p;
}

// ---------- payload RSC da página de busca ----------

/** Junta os pedaços `self.__next_f.push([1,"..."])` num texto só (o payload do app router). */
function payloadRsc(html: string): string {
  let s = "";
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      s += JSON.parse(m[1]) as string;
    } catch {
      // pedaço malformado — ignora
    }
  }
  return s;
}

/** Fim do array/objeto que começa em `inicio` (respeita strings). */
function fimDoBloco(s: string, inicio: number): number {
  let prof = 0;
  for (let i = inicio; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      for (i++; i < s.length && s[i] !== '"'; i++) if (s[i] === "\\") i++;
    } else if (c === "[" || c === "{") prof++;
    else if (c === "]" || c === "}") {
      prof--;
      if (prof === 0) return i;
    }
  }
  return -1;
}

/** O maior `"ads":[...]` com listId (há outros, vazios, como topoVipSelection). */
function anunciosDoPayload(s: string): AnuncioBruto[] | null {
  let melhor: AnuncioBruto[] | null = null;
  for (let i = s.indexOf('"ads":['); i >= 0; i = s.indexOf('"ads":[', i + 7)) {
    const fim = fimDoBloco(s, i + 6);
    if (fim < 0) continue;
    try {
      const lista = (JSON.parse(s.slice(i + 6, fim + 1)) as AnuncioBruto[]).filter((a) => a && a.listId);
      if (!melhor || lista.length > melhor.length) melhor = lista;
    } catch {
      // não era JSON puro (referência RSC) — tenta o próximo
    }
  }
  return melhor;
}

// ---------- normalização ----------

function numero(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.replace(/\./g, "").replace(",", ".").match(/\d+(\.\d+)?/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function semAcento(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

/**
 * "Venda - apartamento padrão" / "apartamento cobertura" / "casa em condominio fechado" /
 * "casa em rua pública" / "casa de vila"... + "Tipo" (re_types: Padrão, Cobertura, Sobrado,
 * Casa de condomínio, Loft...).
 */
function tipoDe(categoria: string, real: string, sub: string): TipoImovel | null {
  const t = `${semAcento(real)} | ${semAcento(sub)}`;
  const cat = semAcento(categoria);
  if (/cobertura/.test(t)) return "PENTHOUSE";
  if (/apartamento|loft|studio|kitnet|flat/.test(t) || cat === "apartamentos") return "APARTMENT";
  if (/condominio/.test(t)) return "CONDOMINIUM";
  if (/vila/.test(t)) return "VILLAGE_HOUSE";
  if (/sobrado/.test(t)) return "TWO_STORY_HOUSE";
  if (/casa/.test(t) || cat === "casas") return "HOME";
  if (/terreno|lote/.test(t)) return "RESIDENTIAL_ALLOTMENT_LAND";
  return null;
}

function normalizar(a: AnuncioBruto): Anuncio {
  const prop = (nome: string) => a.properties?.find((p) => p.name === nome)?.value ?? "";
  const categoria = a.categoryName ?? a.category ?? prop("category");
  const url = a.url ? (a.url.startsWith("http") ? a.url : `${BASE}${a.url}`) : "";
  return {
    id: `olx:${a.listId}`,
    tipo: tipoDe(categoria, prop("real_estate_type"), prop("re_types")),
    titulo: a.subject ?? "",
    url,
    preco: numero(a.priceValue ?? a.price),
    area: numero(prop("size")),
    // particular: o nome é de pessoa física — não guardamos
    anunciante: a.professionalAd ? a.olxPay?.transactionalSellerName?.trim() || null : "Particular",
    criadoNoPortal: a.date ? new Date(a.date * 1000).toISOString() : null,
  };
}

// ---------- Fonte ----------

/** ids já devolvidos nesta leitura do bairro (anúncio novo empurra a lista e repete na página seguinte) */
const vistos = new Map<string, Set<string>>();

async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  const caminho = await caminhoDoBairro(b);
  if (!caminho) return [];
  const url = `${BASE}/imoveis/venda/${caminho}?${pagina > 0 ? `o=${pagina + 1}&` : ""}sf=1`;
  const res = await abrirPagina(url, { esperarMs: 1_500, bloquearScripts: true });
  if (res.status === 404) return [];
  if (res.status !== 200) throw new Error(`OLX busca ${res.status}`);
  if (/captcha|challenge-platform/i.test(res.html) && res.html.length < 100_000) {
    throw new Error("OLX pediu verificação anti-robô (captcha)");
  }
  const rsc = payloadRsc(res.html);
  // depois da última página a OLX volta pra outra (ou mostra 0 anúncios)
  const pg = /"filters":\{"pageIndex":(\d+)/.exec(rsc)?.[1];
  if (pg && Number(pg) !== pagina + 1) return [];
  const brutos = anunciosDoPayload(rsc);
  if (brutos === null) {
    if (/"totalOfAds":0\b/.test(rsc) || !rsc) return [];
    throw new Error("OLX: não achei a lista de anúncios no payload da página");
  }
  const bairro = slug(b.nome);
  const cidade = slug(b.cidade);
  const k = chave(b);
  if (pagina === 0 || !vistos.has(k)) vistos.set(k, new Set());
  const ja = vistos.get(k)!;
  const saida: Anuncio[] = [];
  for (const a of brutos) {
    const loc = a.locationDetails;
    if (loc && (slug(loc.neighbourhood ?? "") !== bairro || slug(loc.municipality ?? "") !== cidade)) continue;
    const n = normalizar(a);
    if (ja.has(n.id)) continue;
    ja.add(n.id);
    saida.push(n);
  }
  // página cheia mas nenhum do bairro: o caminho não era o bairro pedido — não mistura
  return saida;
}

async function buscarDescricao(url: string): Promise<string> {
  const res = await abrirPagina(url, { esperarMs: 500, bloquearScripts: true });
  if (res.status === 404 || res.status === 410) return "";
  if (res.status !== 200) throw new Error(`OLX anúncio ${res.status}`);
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  for (let m = re.exec(res.html); m; m = re.exec(res.html)) {
    try {
      const j = JSON.parse(m[1]) as { Object?: { description?: string }; description?: string };
      const d = j.Object?.description ?? j.description;
      if (d) return textoDoHtml(d);
    } catch {
      // bloco ld+json de outro tipo
    }
  }
  const og = /<meta[^>]+property="og:description"[^>]+content="([^"]*)"/.exec(res.html)?.[1];
  return og ? textoDoHtml(og.replace(/&lt;/g, "<").replace(/&gt;/g, ">")) : "";
}

export const olx: Fonte = {
  portal: "olx",
  nome: "OLX",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: false,
  paginasAprendizado: 4, // 50 por página → ~200 anúncios (~80 KB por página sem os scripts do site)
  paginasNovos: 3,
  pausaMs: 3_000,
  descricoesEmParalelo: 1,
};
