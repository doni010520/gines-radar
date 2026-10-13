/**
 * Reavalia os anúncios já gravados com as regras atuais (média por grupo, % ou teto do bairro,
 * duplicados) — útil depois de mudar uma regra, sem precisar buscar tudo de novo no portal.
 * Com --descricoes, abre a página de cada oportunidade e aplica também as palavras-chave.
 *
 * Rodar:  npx tsx scripts/reavaliar.ts [--descricoes]   (lê .env.coletor)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const linha of readFileSync(join(process.cwd(), ".env.coletor"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const { AMOSTRA_MINIMA, GRUPOS, avaliar, grupoDoTipo, mediana, palavrasEncontradas } = await import("../src/lib/analise");
  const { buscarDescricao } = await import("../src/lib/zap");
  const comDescricoes = process.argv.includes("--descricoes");
  const db = createServiceClient();

  const { data: palavras } = await db.from("radar_palavras").select("termo").eq("ativo", true);
  const termos = (palavras ?? []).map((p) => p.termo);
  const { data: bairros } = await db.from("radar_bairros").select("*").eq("ativo", true);

  for (const b of bairros ?? []) {
    const { data: anuncios } = await db.from("radar_anuncios").select("*").eq("bairro_id", b.id).limit(5000);
    const lista = anuncios ?? [];
    const grupos = Object.fromEntries(GRUPOS.map((g) => [g, [] as number[]]));
    for (const a of lista) if (a.preco_m2) grupos[grupoDoTipo(a.tipo)].push(Number(a.preco_m2));
    const ref = Object.fromEntries(
      GRUPOS.map((g) => [g, grupos[g].length >= AMOSTRA_MINIMA ? mediana(grupos[g]) : null])
    );
    console.log(`\n${b.nome}: medianas`, ref, "amostras", Object.fromEntries(GRUPOS.map((g) => [g, grupos[g].length])));

    const vistos = new Map<string, string>(); // "preço|área" → id da oportunidade
    let n = 0;
    // do maior deságio pro menor: o representante de um imóvel repetido é o primeiro visto
    const ordenados = [...lista].sort((x, y) => Number(x.preco_m2 ?? 1e9) - Number(y.preco_m2 ?? 1e9));
    for (const a of ordenados) {
      if (a.descartado) continue;
      let palavrasAchadas: string[] = a.palavras ?? [];
      let descricao = a.descricao;
      const preliminar = avaliar({
        precoM2: a.preco_m2 ? Number(a.preco_m2) : null,
        tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
        pctAbaixoMedia: Number(b.pct_abaixo_media),
        mediaM2: ref[grupoDoTipo(a.tipo)],
        palavras: palavrasAchadas,
      });
      if (preliminar.oportunidade && comDescricoes && !descricao) {
        try {
          descricao = await buscarDescricao(a.url ?? "");
          palavrasAchadas = palavrasEncontradas(`${a.titulo}\n${descricao}`, termos);
          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          console.log("  sem descrição", a.id, String(err).slice(0, 80));
        }
      }
      const av = avaliar({
        precoM2: a.preco_m2 ? Number(a.preco_m2) : null,
        tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
        pctAbaixoMedia: Number(b.pct_abaixo_media),
        mediaM2: ref[grupoDoTipo(a.tipo)],
        palavras: palavrasAchadas,
      });
      const chave = `${a.preco}|${a.area}`;
      let motivo = av.motivo || null;
      let oportunidade = av.oportunidade;
      if (oportunidade && a.preco && a.area && vistos.has(chave)) {
        oportunidade = false;
        motivo = `mesmo imóvel de ${vistos.get(chave)} (outra imobiliária)`;
      } else if (oportunidade) {
        vistos.set(chave, a.id);
        n++;
      }
      await db
        .from("radar_anuncios")
        .update({ oportunidade, motivo, pct_abaixo: av.pctAbaixo, descricao, palavras: palavrasAchadas })
        .eq("id", a.id);
    }
    console.log(`  → ${n} oportunidades`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
