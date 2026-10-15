/**
 * Proprietário Direto — anúncios publicados pelo próprio dono (sem corretor).
 *
 * Busca: a página de resultados é Next.js com SSR; o __NEXT_DATA__ já traz os 15 anúncios da
 * página completos (preço de venda, área, tipo, bairro, data de criação, dono e até a descrição).
 * URL: /venda/imovel/<uf>/<cidade>/<bairro>/direto-com-proprietario?page=N (N começa em 1;
 * "imovel" = todos os tipos — "imoveis" responde 0). Depois da última página o site dá 404.
 * Ordem padrão "newer" (mais recentes), MAS os anúncios impulsionados (boost) ocupam o topo da
 * 1ª página com qualquer data — por isso não dá pra parar no 1º anúncio conhecido: lemos sempre
 * `paginasNovos` páginas.
 * Bairro que o site não reconhece cai numa busca genérica sem `params.neighborhood` — aí
 * devolvemos [], e ainda filtramos cada anúncio pelo slug do bairro.
 * Descrição: o SSR da busca já tem, mas o contrato pede por URL — sai do __NEXT_DATA__ da
 * página do anúncio (props.pageProps.property.desc).
 *
 * Validado em 15/10/26.
 */
import { siglaUf } from "../estados";
import { baixar, HEADERS_NAVEGADOR, slug, textoDoHtml } from "./http";
import type { Anuncio, BairroBusca, Fonte, TipoImovel } from "./tipos";

const BASE = "https://www.proprietariodireto.com.br";

type ImovelBruto = {
  id: string | number;
  title?: string;
  property_type?: string;
  sale?: string | number;
  area?: number | string;
  created_at?: string;
  url?: string;
  desc?: string;
  neighborhood?: { name?: string; slug?: string } | null;
  user?: { first_name?: string; is_broker?: number; real_estate_name?: string | null } | null;
};

type PaginaBusca = {
  properties?: ImovelBruto[];
  params?: { neighborhood?: string; total?: number; last_page?: number };
};

/** Tipos do Proprietário Direto → vocabulário do radar. Comercial, chácara, sítio etc. ficam de fora. */
const TIPOS: Record<string, TipoImovel> = {
  apartamento: "APARTMENT",
  studio: "APARTMENT",
  kitnet: "APARTMENT",
  flat: "APARTMENT",
  loft: "APARTMENT",
  cobertura: "PENTHOUSE",
  casa: "HOME",
  sobrado: "TWO_STORY_HOUSE",
  "casa de condominio": "CONDOMINIUM",
  "casa de vila": "VILLAGE_HOUSE",
  terreno: "RESIDENTIAL_ALLOTMENT_LAND",
};

function semAcento(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

function numero(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "2025-12-21 07:25:06" (horário de Brasília) → ISO. */
function dataIso(v?: string): string | null {
  if (!v) return null;
  const d = new Date(`${v.replace(" ", "T")}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function nextData<T>(html: string): T | null {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  const json = JSON.parse(m[1]) as { props?: { pageProps?: T } };
  return json.props?.pageProps ?? null;
}

function normalizar(p: ImovelBruto): Anuncio {
  const u = p.user;
  const anunciante = u?.is_broker ? u.real_estate_name || u.first_name : u?.first_name;
  return {
    id: `proprietariodireto:${p.id}`,
    tipo: TIPOS[semAcento(p.property_type ?? "")] ?? null,
    titulo: p.title?.trim() ?? "",
    url: p.url?.startsWith("http") ? p.url : p.url ? `${BASE}${p.url}` : "",
    preco: numero(p.sale),
    area: numero(p.area), // terreno também vem só em "area"
    anunciante: anunciante?.trim() || "Proprietário",
    criadoNoPortal: dataIso(p.created_at),
  };
}

async function buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]> {
  const uf = (siglaUf(b.estado) ?? b.estado).toLowerCase();
  const bairro = slug(b.nome);
  const url = `${BASE}/venda/imovel/${uf}/${slug(b.cidade)}/${bairro}/direto-com-proprietario?page=${pagina + 1}`;
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status === 404) return []; // passou da última página
  if (res.status !== 200) throw new Error(`Proprietário Direto busca ${res.status}: ${res.corpo.slice(0, 200)}`);
  const pp = nextData<PaginaBusca>(res.corpo);
  if (!pp) throw new Error(`Proprietário Direto: página sem __NEXT_DATA__: ${res.corpo.slice(0, 200)}`);
  // bairro não reconhecido → o site cai numa busca genérica; não queremos anúncios de outro lugar
  if (!pp.params?.neighborhood || slug(pp.params.neighborhood) !== bairro) return [];
  if (pp.params.last_page && pagina + 1 > pp.params.last_page) return [];
  return (pp.properties ?? [])
    .filter((p) => !p.neighborhood?.slug || slug(p.neighborhood.slug) === bairro)
    .map(normalizar);
}

async function buscarDescricao(url: string): Promise<string> {
  const res = await baixar(url, HEADERS_NAVEGADOR);
  if (res.status !== 200) throw new Error(`Proprietário Direto anúncio ${res.status}`);
  const pp = nextData<{ property?: { desc?: string } }>(res.corpo);
  return textoDoHtml(pp?.property?.desc ?? "");
}

export const proprietariodireto: Fonte = {
  portal: "proprietariodireto",
  nome: "Proprietário Direto",
  buscarPagina,
  buscarDescricao,
  ordenadoPorRecentes: false,
  paginasAprendizado: 20, // 15 por página → 300 anúncios (a maioria dos bairros tem bem menos)
  paginasNovos: 3,
};
