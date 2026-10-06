/**
 * Leitura do ZAP Imóveis.
 *
 * Busca: API interna do site (glue-api), a mesma que a página de resultados usa. Devolve
 * preço, área, tipo e endereço já estruturados, ordenados pelos MAIS RECENTES — então cada
 * varredura só precisa ler o topo da lista até encontrar anúncio que já conhece.
 * Descrição: não vem na busca; sai da página do anúncio (data-testid="description-content").
 *
 * Validado em 06/10/26. Se o ZAP mudar o formato, é aqui que quebra — os erros caem em
 * radar_logs com a resposta crua pra ajustar.
 *
 * Requisições via `curl` e não via fetch: a Cloudflare do ZAP reconhece a assinatura TLS do
 * Node (fetch e https dão 403) e deixa passar o curl. Por isso a imagem instala curl.
 */
import { execFile } from "node:child_process";

type Resposta = { status: number; corpo: string };

function baixar(url: string, headers: Record<string, string>): Promise<Resposta> {
  const args = ["-sSL", "--compressed", "--max-time", "30", "-w", "\n%{http_code}"];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl falhou: ${err.message}`));
      const i = stdout.lastIndexOf("\n");
      resolve({ status: Number(stdout.slice(i + 1)), corpo: stdout.slice(0, i) });
    });
  });
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const HEADERS_API = {
  "User-Agent": UA,
  "Accept-Language": "pt-BR,pt;q=0.9",
  "x-domain": ".zapimoveis.com.br",
  Origin: "https://www.zapimoveis.com.br",
  Referer: "https://www.zapimoveis.com.br/",
};

export type BairroBusca = { nome: string; zona: string; cidade: string; estado: string };

export type AnuncioZap = {
  id: string; // "zap:<id>"
  tipo: string | null;
  titulo: string;
  url: string;
  preco: number | null;
  area: number | null;
  anunciante: string | null;
  criadoNoPortal: string | null;
};

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

function normalizar(item: ListingBruto): AnuncioZap {
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

/** Uma página de anúncios de venda do bairro, do mais novo pro mais antigo. */
/** Máximo do ZAP: 30 por página (acima disso responde 400). Filtro de tipo na API é ignorado — filtra-se em quem chama. */
export async function buscarPagina(b: BairroBusca, pagina: number, tamanho = 30): Promise<AnuncioZap[]> {
  const params = new URLSearchParams({
    business: "SALE",
    listingType: "USED",
    addressCity: b.cidade,
    addressState: b.estado,
    addressNeighborhood: b.nome,
    ...(b.zona ? { addressZone: b.zona } : {}),
    size: String(tamanho),
    from: String(pagina * tamanho),
    categoryPage: "RESULT",
    portal: "ZAP",
    sort: "createdAt DESC id ASC",
  });
  const res = await baixar(`https://glue-api.zapimoveis.com.br/v2/listings?${params}`, HEADERS_API);
  if (res.status !== 200) throw new Error(`ZAP busca ${res.status}: ${res.corpo.slice(0, 200)}`);
  const json = JSON.parse(res.corpo) as { search?: { result?: { listings?: ListingBruto[] } } };
  return (json.search?.result?.listings ?? []).map(normalizar);
}

function textoDoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Descrição completa do anúncio (é onde aparecem "precisa de reforma", "inventário"...). */
export async function buscarDescricao(url: string): Promise<string> {
  const res = await baixar(url, { "User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9" });
  if (res.status !== 200) throw new Error(`ZAP anúncio ${res.status}`);
  const html = res.corpo;
  const m = html.match(/data-testid="description-content"[^>]*>([\s\S]*?)<\/p>/);
  return m ? textoDoHtml(m[1]) : "";
}
