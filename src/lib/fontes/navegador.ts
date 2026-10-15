/**
 * Navegador de verdade (Chromium via playwright-core) pros portais que barram curl: OLX e
 * Mercado Livre (testado em 15/10/26). Em modo invisível (headless) os dois dão 403 — o
 * navegador roda "visível"; no servidor, numa tela virtual (Xvfb, ver Dockerfile).
 *
 * Igual ao http.ts: tenta direto e, se o site bloquear, aquele site passa a ir pelo proxy.
 * Imagem, fonte e vídeo são bloqueados (o proxy é cobrado por GB). Um navegador por saída,
 * aberto sob demanda e fechado quando a busca termina (fecharNavegadores()).
 */
import type { Browser, BrowserContext, Page } from "playwright-core";
import { consumo } from "./http";

const CHROME_WINDOWS = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function caminhoDoChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return process.platform === "win32" ? CHROME_WINDOWS : "/usr/bin/chromium-browser";
}

/**
 * O DNS do container não resolve p.webshare.io (geo-DNS) e o Chromium usa o DNS do sistema
 * pra achar o proxy — resolve por DNS-over-HTTPS aqui e passa o IP.
 */
async function servidorDoProxy(): Promise<{ server: string; username?: string; password?: string } | null> {
  const bruto = process.env.RADAR_PROXY;
  if (!bruto) return null;
  const u = new URL(bruto);
  let host = u.hostname;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`, {
      headers: { accept: "application/dns-json" },
    });
    const j = (await res.json()) as { Answer?: { type: number; data: string }[] };
    host = j.Answer?.find((a) => a.type === 1)?.data ?? host;
  }
  return {
    server: `${u.protocol}//${host}:${u.port || 80}`,
    username: decodeURIComponent(u.username) || undefined,
    password: decodeURIComponent(u.password) || undefined,
  };
}

let telaVirtual: Promise<string | undefined> | null = null;

/**
 * No servidor (Linux sem monitor) o Chrome "visível" precisa de uma tela: sobe um Xvfb na
 * primeira vez e devolve o DISPLAY. Fica de pé enquanto o processo vive (é leve, ~10 MB).
 */
function display(): Promise<string | undefined> {
  if (process.platform !== "linux" || process.env.DISPLAY) return Promise.resolve(process.env.DISPLAY);
  if (!telaVirtual) {
    telaVirtual = (async () => {
      const { spawn } = await import("node:child_process");
      const tela = ":99";
      const xvfb = spawn("Xvfb", [tela, "-screen", "0", "1366x900x24", "-nolisten", "tcp"], { stdio: "ignore", detached: true });
      xvfb.unref();
      xvfb.on("exit", () => {
        telaVirtual = null; // morreu: a próxima busca tenta subir de novo
      });
      await new Promise((r) => setTimeout(r, 1500));
      return tela;
    })();
  }
  return telaVirtual;
}

const navegadores = new Map<"direto" | "proxy", Promise<Browser>>();

async function navegador(saida: "direto" | "proxy"): Promise<Browser> {
  let b = navegadores.get(saida);
  if (!b) {
    b = (async () => {
      const { chromium } = await import("playwright-core");
      const proxy = saida === "proxy" ? await servidorDoProxy() : null;
      const tela = await display();
      return chromium.launch({
        executablePath: caminhoDoChrome(),
        headless: false,
        env: { ...process.env, ...(tela ? { DISPLAY: tela } : {}) },
        proxy: proxy ?? undefined,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--window-size=1366,900",
        ],
      });
    })();
    navegadores.set(saida, b);
  }
  return b;
}

/** Fecha os navegadores abertos (chamar no fim da busca — cada um segura ~400 MB). */
export async function fecharNavegadores(): Promise<void> {
  const abertos = [...navegadores.values()];
  navegadores.clear();
  await Promise.all(abertos.map(async (p) => (await p.catch(() => null))?.close().catch(() => {})));
}

export type PaginaAberta = { status: number; html: string; url: string };

const sitesComProxy = new Set<string>();

function bloqueado(status: number, html: string): boolean {
  if (status === 403 || status === 429) return true;
  return html.length < 60_000 && /cf-chl|challenge-platform|attention required|just a moment|bot_challenge|captcha/i.test(html);
}

async function abrirUmaVez(
  saida: "direto" | "proxy",
  url: string,
  opts: { esperarMs: number; esperarSeletor?: string; aoAbrir?: (p: Page) => Promise<void> }
): Promise<PaginaAberta> {
  const b = await navegador(saida);
  const ctx: BrowserContext = await b.newContext({ locale: "pt-BR", viewport: { width: 1366, height: 900 } });
  try {
    const page = await ctx.newPage();
    await page.route("**/*", (r) => {
      const tipo = r.request().resourceType();
      return tipo === "image" || tipo === "font" || tipo === "media" ? r.abort() : r.continue();
    });
    page.on("requestfinished", async (req) => {
      try {
        const s = await req.sizes();
        const c = saida === "proxy" ? consumo.proxy : consumo.direto;
        c.bytes += s.responseBodySize + s.responseHeadersSize;
      } catch {
        // tamanho indisponível (requisição cancelada) — não conta
      }
    });
    const c = saida === "proxy" ? consumo.proxy : consumo.direto;
    c.requisicoes++;
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    let status = resp?.status() ?? 0;
    // desafio anti-robô (Mercado Livre): o navegador resolve sozinho e recarrega — espera
    if (bloqueado(status, await page.content())) {
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(5_000);
      if (!bloqueado(200, await page.content())) status = 200;
    }
    if (opts.esperarSeletor) await page.waitForSelector(opts.esperarSeletor, { timeout: opts.esperarMs }).catch(() => {});
    else await page.waitForTimeout(opts.esperarMs);
    if (opts.aoAbrir) await opts.aoAbrir(page);
    return { status, html: await page.content(), url: page.url() };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Abre a página e devolve o HTML já renderizado. Direto primeiro; se o site bloquear, aquele
 * site vai pelo proxy (até 2 tentativas, cada uma com outro IP).
 */
export async function abrirPagina(
  url: string,
  opts: { esperarMs?: number; esperarSeletor?: string; aoAbrir?: (p: Page) => Promise<void> } = {}
): Promise<PaginaAberta> {
  const o = { esperarMs: opts.esperarMs ?? 4_000, esperarSeletor: opts.esperarSeletor, aoAbrir: opts.aoAbrir };
  const site = new URL(url).host;
  const temProxy = !!process.env.RADAR_PROXY;
  if (!temProxy || !sitesComProxy.has(site)) {
    const r = await abrirUmaVez("direto", url, o).catch(() => null);
    if (r && (!temProxy || !bloqueado(r.status, r.html))) return r;
    if (r) sitesComProxy.add(site);
  }
  let ultimo: PaginaAberta | null = null;
  for (let t = 0; t < 2; t++) {
    ultimo = await abrirUmaVez("proxy", url, o).catch(() => null);
    if (ultimo && !bloqueado(ultimo.status, ultimo.html)) return ultimo;
  }
  if (ultimo) return ultimo;
  throw new Error(`não consegui abrir ${site} nem pelo proxy`);
}
