/**
 * Acesso aos portais — compartilhado por todas as fontes.
 *
 * Requisições via `curl` e não via fetch: a Cloudflare reconhece a assinatura TLS do Node
 * (fetch e https dão 403) e deixa passar o curl. Por isso a imagem instala curl.
 */
import { execFile } from "node:child_process";

export type Resposta = { status: number; corpo: string };

/**
 * Saída residencial (Webshare): o IP do servidor é bloqueado pelos portais.
 * p.webshare.io é um geo-DNS com dezenas de IPs e o DNS do container não resolve (13/10/26) —
 * com proxy, o curl resolve nomes por DNS-over-HTTPS.
 */
export function argsProxy(): string[] {
  const proxy = process.env.RADAR_PROXY;
  return proxy ? ["--proxy", proxy, "--doh-url", "https://cloudflare-dns.com/dns-query"] : [];
}

/** A mensagem de erro do execFile repete a linha de comando — tira a senha do proxy dela. */
const semSenha = (texto: string) => texto.replace(/(\/\/[^:\s/]+:)[^@\s]+@/g, "$1***@");

function baixarUmaVez(url: string, headers: Record<string, string>, opts: { metodo?: string; corpo?: string }): Promise<Resposta> {
  const args = ["-sSL", "--compressed", "--max-time", "30", "-w", "\n%{http_code}", ...argsProxy()];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  if (opts.metodo) args.push("-X", opts.metodo);
  if (opts.corpo !== undefined) args.push("--data-raw", opts.corpo);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 30 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`curl falhou: ${semSenha(err.message).split("\n").slice(-2).join(" ")}`));
      const i = stdout.lastIndexOf("\n");
      resolve({ status: Number(stdout.slice(i + 1)), corpo: stdout.slice(0, i) });
    });
  });
}

/**
 * Com proxy rotativo cada tentativa sai por outro IP: falha de conexão, bloqueio (403/429) ou
 * erro do portal (5xx) ganham mais duas chances antes de desistir.
 */
export async function baixar(
  url: string,
  headers: Record<string, string>,
  opts: { metodo?: string; corpo?: string } = {}
): Promise<Resposta> {
  const tentativas = process.env.RADAR_PROXY ? 3 : 1;
  let ultimo: Resposta | Error = new Error("sem tentativa");
  for (let t = 1; t <= tentativas; t++) {
    try {
      ultimo = await baixarUmaVez(url, headers, opts);
      if (![403, 429].includes(ultimo.status) && ultimo.status < 500) return ultimo;
    } catch (err) {
      ultimo = err instanceof Error ? err : new Error(String(err));
    }
    if (t < tentativas) await new Promise((r) => setTimeout(r, 2000));
  }
  if (ultimo instanceof Error) throw ultimo;
  return ultimo;
}

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

/**
 * Página HTML: pelo proxy, a Cloudflare só libera com o conjunto completo de cabeçalhos de
 * navegador — só User-Agent dava 403 sempre (testado na VPS em 13/10/26).
 */
export const HEADERS_NAVEGADOR: Record<string, string> = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "sec-ch-ua": '"Chromium";v="129", "Not=A?Brand";v="8"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

/** Texto puro de um trecho de HTML (descrição do anúncio). */
export function textoDoHtml(html: string): string {
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

/** "Vila Madalena" → "vila-madalena"; "São Paulo" → "sao-paulo" (slug de URL dos portais). */
export function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
