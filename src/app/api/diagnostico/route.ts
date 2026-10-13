import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { argsProxy } from "@/lib/zap";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Testa, de dentro do servidor, se os portais respondem — direto (curl) e via FlareSolverr
 * (Chromium real). Serve pra decidir o caminho quando a Cloudflare bloquear.
 * GET /api/diagnostico?token=RADAR_TOKEN
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

const ALVOS = {
  zapApi:
    "https://glue-api.zapimoveis.com.br/v2/listings?business=SALE&listingType=USED&addressCity=S%C3%A3o%20Paulo&addressState=S%C3%A3o%20Paulo&addressNeighborhood=Pinheiros&addressZone=Zona%20Oeste&size=3&from=0&categoryPage=RESULT&portal=ZAP",
  zapBusca: "https://www.zapimoveis.com.br/venda/imoveis/sp+sao-paulo+zona-oeste+pinheiros/",
  olx: "https://www.olx.com.br/imoveis/venda/estado-sp/sao-paulo-e-regiao/zona-oeste/pinheiros",
};

function resumo(corpo: string) {
  const titulo = corpo.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  return {
    titulo,
    bloqueio: /you have been blocked|sorry, you have been blocked/i.test(corpo)
      ? "bloqueio"
      : /just a moment|cf-chl|challenge-platform/i.test(corpo)
        ? "desafio"
        : null,
    ray: corpo.match(/Ray ID: <strong[^>]*>([^<]+)/i)?.[1] ?? null,
    inicio: corpo.slice(0, 160),
  };
}

function viaCurl(url: string): Promise<unknown> {
  const args = ["-sS", "--compressed", "--max-time", "30", "-w", "\n%{http_code}", "-H", `User-Agent: ${UA}`, "-H", "Accept-Language: pt-BR"];
  if (url.includes("glue-api")) args.push("-H", "x-domain: .zapimoveis.com.br", "-H", "Origin: https://www.zapimoveis.com.br");
  args.push(...argsProxy());
  args.push(url);
  return new Promise((resolve) => {
    execFile("curl", args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ erro: err.message });
      const i = stdout.lastIndexOf("\n");
      resolve({ status: Number(stdout.slice(i + 1)), ...resumo(stdout.slice(0, i)) });
    });
  });
}

async function viaFlare(url: string): Promise<unknown> {
  const base = process.env.FLARESOLVERR_URL;
  if (!base) return { erro: "FLARESOLVERR_URL não configurado" };
  try {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: "request.get", url, maxTimeout: 60000 }),
      signal: AbortSignal.timeout(90_000),
    });
    const j = (await res.json()) as { status?: string; message?: string; solution?: { status?: number; response?: string } };
    return { flare: j.status, mensagem: j.message, status: j.solution?.status, ...resumo(j.solution?.response ?? "") };
  } catch (err) {
    return { erro: String(err) };
  }
}

const NAVEGADOR = [
  "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language: pt-BR,pt;q=0.9,en;q=0.8",
  "Upgrade-Insecure-Requests: 1",
  "Sec-Fetch-Dest: document",
  "Sec-Fetch-Mode: navigate",
  "Sec-Fetch-Site: none",
  "Sec-Fetch-User: ?1",
  'sec-ch-ua: "Chromium";v="129", "Not=A?Brand";v="8"',
  "sec-ch-ua-mobile: ?0",
  'sec-ch-ua-platform: "Windows"',
];

/** Página de anúncio com variações de requisição — acha qual passa pela Cloudflare. */
function variante(url: string, extra: string[]): Promise<unknown> {
  const args = ["-sS", "--compressed", "--max-time", "30", "-o", "/dev/null", "-w", "%{http_code} %{http_version}", "-H", `User-Agent: ${UA}`, ...extra, ...argsProxy(), url];
  return new Promise((resolve) => {
    execFile("curl", args, (err, stdout) => resolve(err ? `erro: ${err.message.slice(-120)}` : stdout));
  });
}

async function testarAnuncio(url: string) {
  const nav = NAVEGADOR.flatMap((h) => ["-H", h]);
  const variantes: Record<string, string[]> = {
    atual: ["-H", "Accept-Language: pt-BR,pt;q=0.9"],
    http11: ["--http1.1", "-H", "Accept-Language: pt-BR,pt;q=0.9"],
    navegador: nav,
    navegador_http11: ["--http1.1", ...nav],
  };
  const out: Record<string, unknown[]> = {};
  for (const [nome, extra] of Object.entries(variantes)) {
    out[nome] = [];
    for (let i = 0; i < 3; i++) out[nome].push(await variante(url, extra));
  }
  const versao = await new Promise((r) => execFile("curl", ["-V"], (_e, so) => r(String(so).split("\n")[0])));
  return { versao, ...out };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-radar-token");
  if (!process.env.RADAR_TOKEN || token !== process.env.RADAR_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const out: Record<string, unknown> = {};
  for (const [nome, url] of Object.entries(ALVOS)) {
    out[`${nome}_curl`] = await viaCurl(url);
    out[`${nome}_flaresolverr`] = await viaFlare(url);
  }
  return NextResponse.json(out);
}
