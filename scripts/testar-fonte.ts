/**
 * Testa uma fonte (portal) sem gravar nada: lê 2 páginas de um bairro, confere os campos e abre
 * a descrição de 2 anúncios.
 *
 * Rodar:  npx tsx scripts/testar-fonte.ts src/lib/fontes/zap.ts "Vila Madalena" "São Paulo" "São Paulo"
 * Proxy:  RADAR_PROXY=http://usuario:senha@p.webshare.io:80 npx tsx scripts/testar-fonte.ts ...
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Anuncio, Fonte } from "../src/lib/fontes/tipos";

async function main() {
  const [arquivo, nome = "Vila Madalena", cidade = "São Paulo", estado = "São Paulo"] = process.argv.slice(2);
  if (!arquivo) throw new Error("informe o arquivo da fonte");
  const mod = (await import(pathToFileURL(resolve(arquivo)).href)) as Record<string, unknown>;
  const f = Object.values(mod).find((v): v is Fonte => !!v && typeof (v as Fonte).buscarPagina === "function");
  if (!f) throw new Error("o arquivo não exporta nenhuma Fonte");

  const b = { nome, zona: "", cidade, estado };
  console.log(`fonte ${f.nome} (${f.portal}) · ordenado por recentes: ${f.ordenadoPorRecentes} · bairro ${nome}/${cidade}`);
  const todos: Anuncio[] = [];
  for (let p = 0; p < 2; p++) {
    const t0 = Date.now();
    const lote = await f.buscarPagina(b, p);
    console.log(`\npágina ${p}: ${lote.length} anúncios em ${Date.now() - t0} ms`);
    for (const a of lote.slice(0, 5)) console.log(" ", JSON.stringify(a));
    todos.push(...lote);
    if (!lote.length) break;
  }
  const n = todos.length || 1;
  const pct = (fn: (a: Anuncio) => unknown) => `${Math.round((todos.filter(fn).length / n) * 100)}%`;
  console.log(`\nqualidade (${todos.length}): preço ${pct((a) => a.preco)} · área ${pct((a) => a.area)} · tipo ${pct((a) => a.tipo)} · url ${pct((a) => a.url?.startsWith("http"))} · data ${pct((a) => a.criadoNoPortal)}`);
  console.log("tipos:", [...new Set(todos.map((a) => a.tipo))].join(", "));
  console.log("ids repetidos:", todos.length - new Set(todos.map((a) => a.id)).size);
  for (const a of todos.slice(0, 2)) {
    const d = await f.buscarDescricao(a.url);
    console.log(`\ndescrição de ${a.id} (${d.length} caracteres): ${d.slice(0, 300)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
