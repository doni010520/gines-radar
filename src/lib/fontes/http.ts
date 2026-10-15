/**
 * Acesso aos portais — compartilhado por todas as fontes.
 *
 * Requisições via `curl` e não via fetch: a Cloudflare reconhece a assinatura TLS do Node
 * (fetch e https dão 403) e deixa passar o curl. Por isso a imagem instala curl.
 */
import { execFile } from "node:child_process";

export type Resposta = { status: number; corpo: string };

/**
 * Saída residencial (Webshare): o IP do servidor é bloqueado por alguns portais.
 * p.webshare.io é um geo-DNS com dezenas de IPs e o DNS do container não resolve (13/10/26) —
 * com proxy, o curl resolve nomes por DNS-over-HTTPS.
 */
export function argsProxy(): string[] {
  const proxy = process.env.RADAR_PROXY;
  return proxy ? ["--proxy", proxy, "--doh-url", "https://cloudflare-dns.com/dns-query"] : [];
}

/** A mensagem de erro do execFile repete a linha de comando — tira a senha do proxy dela. */
const semSenha = (texto: string) => texto.replace(/(\/\/[^:\s/]+:)[^@\s]+@/g, "$1***@");

/**
 * Consumo desde que o processo subiu, separado por saída — o plano do proxy é por GB
 * (1 GB/mês em 15/10/26), então a busca registra quanto gastou dele.
 */
export const consumo = { direto: { requisicoes: 0, bytes: 0 }, proxy: { requisicoes: 0, bytes: 0 } };

function baixarUmaVez(
  url: string,
  headers: Record<string, string>,
  opts: { metodo?: string; corpo?: string },
  viaProxy: boolean
): Promise<Resposta> {
  const args = ["-sSL", "--compressed", "--max-time", "30", "-w", "\n%{http_code} %{size_download}", ...(viaProxy ? argsProxy() : [])];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  if (opts.metodo) args.push("-X", opts.metodo);
  if (opts.corpo !== undefined) args.push("--data-raw", opts.corpo);
  args.push(url);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { maxBuffer: 30 * 1024 * 1024 }, (err, stdout) => {
      const saida = viaProxy ? consumo.proxy : consumo.direto;
      saida.requisicoes++;
      if (err) return reject(new Error(`curl falhou: ${semSenha(err.message).split("\n").slice(-2).join(" ")}`));
      const i = stdout.lastIndexOf("\n");
      const [status, bytes] = stdout.slice(i + 1).split(" ").map(Number);
      saida.bytes += bytes || 0;
      resolve({ status, corpo: stdout.slice(0, i) });
    });
  });
}

/**
 * Bloqueio de robô: 403/429 ou página curta de desafio (Cloudflare, CAPTCHA). Página grande que
 * só cita "captcha" num script não conta — é o site normal.
 */
function bloqueado(r: Resposta): boolean {
  if (r.status === 403 || r.status === 429) return true;
  return r.corpo.length < 30_000 && /cf-chl|challenge-platform|attention required|just a moment|bot_challenge|captcha/i.test(r.corpo);
}

/** Sites que bloquearam o acesso direto: dali em diante (até o processo reiniciar) vão pelo proxy. */
const precisaProxy = new Set<string>();

/**
 * Tenta primeiro direto (sem gastar proxy). Se o site bloquear, passa a usar o proxy pra esse
 * site. Pelo proxy rotativo cada tentativa sai por outro IP: falha de conexão, bloqueio ou
 * erro do portal (5xx) ganham mais duas chances antes de desistir.
 */
export async function baixar(
  url: string,
  headers: Record<string, string>,
  opts: { metodo?: string; corpo?: string } = {}
): Promise<Resposta> {
  const site = new URL(url).host;
  const temProxy = !!process.env.RADAR_PROXY;

  if (!temProxy || !precisaProxy.has(site)) {
    try {
      const direto = await baixarUmaVez(url, headers, opts, false);
      if (!temProxy || (!bloqueado(direto) && direto.status < 500)) return direto;
      if (bloqueado(direto)) precisaProxy.add(site);
    } catch (err) {
      if (!temProxy) throw err;
    }
  }

  let ultimo: Resposta | Error = new Error("sem tentativa");
  for (let t = 1; t <= 3; t++) {
    try {
      ultimo = await baixarUmaVez(url, headers, opts, true);
      if (!bloqueado(ultimo) && ultimo.status < 500) return ultimo;
    } catch (err) {
      ultimo = err instanceof Error ? err : new Error(String(err));
    }
    if (t < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  if (ultimo instanceof Error) throw ultimo;
  return ultimo;
}

/** Sites que estão indo pelo proxy (pra tela de diagnóstico). */
export function sitesViaProxy(): string[] {
  return [...precisaProxy];
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
