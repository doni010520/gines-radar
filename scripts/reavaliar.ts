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
  const { avaliar, calcularReferencias, motivoExclusao, palavrasEncontradas, referenciaDe } = await import("../src/lib/analise");
  const { fontePorPortal } = await import("../src/lib/fontes");
  const comDescricoes = process.argv.includes("--descricoes");
  const db = createServiceClient();

  const { data: palavras } = await db.from("radar_palavras").select("termo").eq("ativo", true);
  const termos = (palavras ?? []).map((p) => p.termo);
  const { data: bairros } = await db.from("radar_bairros").select("*").eq("ativo", true);

  for (const b of bairros ?? []) {
    // o banco devolve no máximo 1000 linhas por consulta: pagina
    const lista = [];
    for (let de = 0; ; de += 1000) {
      const { data } = await db.from("radar_anuncios").select("*").eq("bairro_id", b.id).order("id").range(de, de + 999);
      lista.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const ref = calcularReferencias(
      lista.map((a) => ({ tipo: a.tipo, area: a.area === null ? null : Number(a.area), preco_m2: a.preco_m2 === null ? null : Number(a.preco_m2) }))
    );
    console.log(`\n${b.nome}: ${lista.length} anúncios · medianas`, Object.fromEntries(ref));

    // oportunidades já aceitas: mesma área e preço até 5% diferente = mesmo imóvel
    const aceitas: { id: string; preco: number; area: number }[] = [];
    const repetida = (preco: number | null, area: number | null) =>
      preco && area ? aceitas.find((x) => x.area === area && Math.abs(x.preco - preco) <= preco * 0.05) : undefined;
    let n = 0;
    let alterados = 0;
    // do maior deságio pro menor: o representante de um imóvel repetido é o primeiro visto
    const ordenados = [...lista].sort((x, y) => Number(x.preco_m2 ?? 1e9) - Number(y.preco_m2 ?? 1e9));
    for (const a of ordenados) {
      if (a.descartado) continue;
      const area = a.area === null ? null : Number(a.area);
      let palavrasAchadas: string[] = a.palavras ?? [];
      let descricao = a.descricao;
      const params = () => ({
        precoM2: a.preco_m2 ? Number(a.preco_m2) : null,
        tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
        pctAbaixoMedia: Number(b.pct_abaixo_media),
        mediaM2: referenciaDe(ref, a.tipo, area),
        palavras: palavrasAchadas,
      });
      // tipo não residencial (comercial, prédio, rural) nunca é oportunidade
      const residencial = !!a.tipo && b.tipos.includes(a.tipo);
      if (residencial && avaliar(params()).oportunidade && comDescricoes && !descricao) {
        try {
          descricao = (await fontePorPortal(a.portal)?.buscarDescricao(a.url ?? "")) ?? "";
          palavrasAchadas = palavrasEncontradas(`${a.titulo}\n${descricao}`, termos);
          await new Promise((r) => setTimeout(r, 1500));
        } catch (err) {
          console.log("  sem descrição", a.id, String(err).slice(0, 80));
        }
      }
      const av = avaliar(params());
      let motivo = residencial ? av.motivo || null : "fora dos tipos do bairro";
      let oportunidade = residencial && av.oportunidade;
      const exclusao = oportunidade ? motivoExclusao(`${a.titulo}\n${a.anunciante ?? ""}\n${descricao ?? ""}`, a.titulo ?? "") : null;
      const igual = oportunidade && !exclusao ? repetida(Number(a.preco), area) : undefined;
      if (exclusao) {
        oportunidade = false;
        motivo = `excluído: ${exclusao}`;
      } else if (igual) {
        oportunidade = false;
        motivo = `mesmo imóvel de ${igual.id} (outro anúncio)`;
      } else if (oportunidade) {
        aceitas.push({ id: a.id, preco: Number(a.preco), area: Number(area) });
        n++;
      }
      // só grava o que mudou (milhares de linhas)
      const mudou =
        a.oportunidade !== oportunidade ||
        (a.motivo ?? null) !== motivo ||
        (a.pct_abaixo === null ? null : Number(a.pct_abaixo)) !== av.pctAbaixo ||
        a.descricao !== descricao;
      if (!mudou) continue;
      alterados++;
      await db
        .from("radar_anuncios")
        .update({ oportunidade, motivo, pct_abaixo: av.pctAbaixo, descricao, palavras: palavrasAchadas })
        .eq("id", a.id);
    }
    console.log(`  → ${n} oportunidades (${alterados} anúncios atualizados)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
