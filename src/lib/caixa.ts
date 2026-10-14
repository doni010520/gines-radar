/**
 * Imóveis da Caixa (retomados): venda direta, licitação e leilão.
 *
 * A Caixa publica uma planilha por estado (Lista_imoveis_<UF>.csv) com preço, valor de
 * avaliação e DESCONTO já calculados — o desconto real que o Gines procura vem pronto.
 * Validado em 14/10/26: só passa com os cabeçalhos completos de navegador (sem eles cai no
 * CAPTCHA da Radware); o arquivo vem em latin-1, separado por ";".
 */
import { execFile } from "node:child_process";
import { argsProxy, HEADERS_NAVEGADOR } from "./zap";
import { siglaUf } from "./estados";
import { normalizar } from "./analise";

export type ImovelCaixa = {
  id: string; // "caixa:<n° do imóvel>"
  tipo: string | null; // mesmo vocabulário do ZAP (HOME, APARTMENT...)
  titulo: string;
  url: string;
  cidade: string;
  bairro: string;
  endereco: string;
  preco: number | null;
  avaliacao: number | null;
  desconto: number | null; // % sobre a avaliação
  area: number | null;
  descricao: string;
  modalidade: string;
};

function baixarCsv(uf: string): Promise<string> {
  const args = ["-sSL", "--compressed", "--max-time", "90", "-w", "\n%{http_code}", ...argsProxy()];
  for (const [k, v] of Object.entries(HEADERS_NAVEGADOR)) args.push("-H", `${k}: ${v}`);
  args.push(`https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_${uf}.csv`);
  return new Promise((resolve, reject) => {
    execFile("curl", args, { encoding: "buffer", maxBuffer: 80 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error(`Caixa ${uf}: curl falhou`));
      const texto = new TextDecoder("latin1").decode(stdout);
      const i = texto.lastIndexOf("\n");
      const status = Number(texto.slice(i + 1));
      const corpo = texto.slice(0, i);
      if (status !== 200 || !corpo.includes("Valor de avalia")) {
        return reject(new Error(`Caixa ${uf}: resposta inesperada (${status}${/captcha/i.test(corpo) ? ", CAPTCHA" : ""})`));
      }
      resolve(corpo);
    });
  });
}

/** "1.459.000,00" → 1459000 */
function numeroBr(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function tipoDaDescricao(descricao: string): string | null {
  const t = normalizar(descricao.split(",")[0] ?? "");
  if (t.startsWith("casa") || t.startsWith("sobrado")) return "HOME";
  if (t.startsWith("apartamento")) return "APARTMENT";
  if (t.startsWith("terreno") || t.startsWith("lote")) return "RESIDENTIAL_ALLOTMENT_LAND";
  return null; // loja, sala, galpão...: fora dos tipos do radar
}

/** Área privativa; sem ela, área total; terreno usa a área do terreno. */
function areaDaDescricao(descricao: string, tipo: string | null): number | null {
  const pega = (rotulo: string) => {
    const m = descricao.match(new RegExp(`([\\d.]+) de área ${rotulo}`, "i"));
    const n = m ? Number(m[1]) : 0;
    return n > 0 ? n : null;
  };
  if (tipo === "RESIDENTIAL_ALLOTMENT_LAND") return pega("do terreno");
  return pega("privativa") ?? pega("total");
}

const cache = new Map<string, { em: number; lista: ImovelCaixa[] }>();

/** Todos os imóveis da Caixa no estado (cache de 30 min dentro da mesma busca de vários bairros). */
export async function imoveisDoEstado(estado: string): Promise<ImovelCaixa[]> {
  const uf = siglaUf(estado);
  const emCache = cache.get(uf);
  if (emCache && Date.now() - emCache.em < 30 * 60_000) return emCache.lista;

  const linhas = (await baixarCsv(uf)).split(/\r?\n/);
  const lista: ImovelCaixa[] = [];
  for (const linha of linhas) {
    const c = linha.split(";").map((x) => x.trim());
    if (c.length < 12 || !/^\d+$/.test(c[0])) continue; // cabeçalhos
    const descricao = c[9];
    const tipo = tipoDaDescricao(descricao);
    lista.push({
      id: `caixa:${c[0]}`,
      tipo,
      titulo: `${descricao.split(",")[0]} · ${c[10]} (Caixa)`,
      url: c[11] || `https://venda-imoveis.caixa.gov.br/sistema/detalhe-imovel.asp?hdnimovel=${c[0]}`,
      cidade: c[2],
      bairro: c[3],
      endereco: c[4],
      preco: numeroBr(c[5]),
      avaliacao: numeroBr(c[6]),
      desconto: Number(c[7]) > 0 ? Math.round(Number(c[7])) : null,
      area: areaDaDescricao(descricao, tipo),
      descricao: `${c[4]} — ${descricao} Modalidade: ${c[10]}. Financiamento: ${c[8]}.`,
      modalidade: c[10],
    });
  }
  cache.set(uf, { em: Date.now(), lista });
  return lista;
}

/**
 * Imóveis da Caixa no bairro. A Caixa escreve em maiúsculas sem acento e às vezes com
 * complemento ("BROOKLIN PAULISTA", "13°SUBD BUTANTA"). Casa o nome igual ou seguido de
 * complemento — nunca "contém" solto, senão "Pinheiros" pegaria "Alto de Pinheiros".
 */
export async function imoveisCaixaDoBairro(b: { nome: string; cidade: string; estado: string }): Promise<ImovelCaixa[]> {
  const cidade = normalizar(b.cidade).trim();
  const bairro = normalizar(b.nome).trim();
  return (await imoveisDoEstado(b.estado)).filter((i) => {
    if (normalizar(i.cidade).trim() !== cidade) return false;
    const nb = normalizar(i.bairro).replace(/^\d+\s*[°ºo]?\s*subd\.?\s*/, "").trim();
    return nb === bairro || nb.startsWith(`${bairro} `);
  });
}
