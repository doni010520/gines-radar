/**
 * Preenche o bairro (radar_anuncios.bairro_nome) dos anúncios de cadastros "cidade inteira"
 * gravados antes de 05/11/26, quando o radar ainda não guardava o bairro de cada anúncio.
 * Relê as páginas da cidade em cada portal e só atualiza quem já está no banco sem bairro —
 * não grava anúncio novo. Depois rode scripts/reavaliar.ts pra refazer a média por bairro.
 *
 * Rodar:  npx tsx scripts/preencher-bairros.ts   (lê .env.coletor; RADAR_PROXY pro proxy)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const linha of readFileSync(join(process.cwd(), ".env.coletor"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const { FONTES } = await import("../src/lib/fontes");
  const db = createServiceClient();
  const { data: cidades } = await db.from("radar_bairros").select("*").eq("nome", "").eq("ativo", true);

  for (const b of cidades ?? []) {
    const busca = { nome: "", zona: "", cidade: b.cidade, estado: b.estado };
    for (const f of FONTES) {
      const variantes = f.variantes?.(b.tipos) ?? [undefined];
      let preenchidos = 0;
      for (const v of variantes) {
        for (let p = 0; p < f.paginasAprendizado; p++) {
          let lote;
          try {
            lote = await f.buscarPagina(busca, p, v);
          } catch (err) {
            console.log(`  ${f.nome}: ${String(err).slice(0, 120)}`);
            break;
          }
          if (!lote.length) break;
          for (const a of lote.filter((x) => x.bairro)) {
            const { data } = await db
              .from("radar_anuncios")
              .update({ bairro_nome: a.bairro })
              .eq("id", a.id)
              .eq("bairro_id", b.id)
              .is("bairro_nome", null)
              .select("id");
            preenchidos += data?.length ?? 0;
          }
        }
      }
      console.log(`${b.cidade} · ${f.nome}: ${preenchidos} com bairro`);
    }
    const { count } = await db.from("radar_anuncios").select("id", { count: "exact", head: true }).eq("bairro_id", b.id).is("bairro_nome", null);
    console.log(`${b.cidade}: ${count ?? 0} ainda sem bairro (saíram do portal ou passaram das páginas lidas)`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
