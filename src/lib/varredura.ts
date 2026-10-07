import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";
import { buscarDescricao, buscarPagina, type AnuncioZap } from "./zap";
import { AMOSTRA_MINIMA, avaliar, grupoDoTipo, mediana, palavrasEncontradas } from "./analise";
import { enviarWhatsApp } from "./whatsapp";
import { logEvent } from "./log";

type Db = ReturnType<typeof createServiceClient>;
type Bairro = Database["public"]["Tables"]["radar_bairros"]["Row"];

/** 1ª varredura do bairro: lê esse tanto de páginas só pra aprender a média (30 por página). */
const PAGINAS_APRENDIZADO = 10;
/** Varreduras seguintes: lê do mais novo até achar anúncio conhecido, no máximo isso. */
const PAGINAS_MAX_NOVOS = 5;
/** Pausa entre abrir um anúncio e outro — não martelar o portal. */
const PAUSA_MS = 1500;

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Preço por m², ou null quando o anúncio tem preço/área simbólicos ("R$ 1", "sob consulta",
 * área 1 m²) — esses viravam "100% abaixo da média" e poluíam a lista.
 */
function precoM2(a: AnuncioZap): number | null {
  if (!a.preco || !a.area || a.preco < 30_000 || a.area < 10) return null;
  const m2 = Math.round(a.preco / a.area);
  return m2 >= 500 ? m2 : null;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/** Média (mediana) de R$/m² do bairro por grupo, com os anúncios vistos nos últimos 180 dias. */
async function medias(db: Db, bairroId: string): Promise<Record<"terreno" | "construido", number | null>> {
  const desde = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("radar_anuncios")
    .select("tipo,preco_m2")
    .eq("bairro_id", bairroId)
    .gte("visto_em", desde)
    .not("preco_m2", "is", null)
    .limit(5000);
  const grupos = { terreno: [] as number[], construido: [] as number[] };
  for (const r of data ?? []) grupos[grupoDoTipo(r.tipo)].push(Number(r.preco_m2));
  const todos = [...grupos.terreno, ...grupos.construido];
  const ou = (g: number[]) => (g.length >= AMOSTRA_MINIMA ? mediana(g) : todos.length >= AMOSTRA_MINIMA ? mediana(todos) : null);
  return { terreno: ou(grupos.terreno), construido: ou(grupos.construido) };
}

function textoAlerta(b: Bairro, a: AnuncioZap, m2: number | null, pct: number | null, ref: number | null, palavras: string[]) {
  return [
    `🏚️ *Oportunidade — ${b.nome}*`,
    a.titulo,
    a.preco ? `💰 R$ ${fmt(a.preco)}${m2 ? ` · R$ ${fmt(m2)}/m²` : ""}` : "",
    pct !== null && ref ? `📉 ${pct}% abaixo da referência do bairro (R$ ${fmt(ref)}/m²)` : "",
    palavras.length ? `🔎 ${palavras.map((p) => `"${p}"`).join(", ")}` : "",
    a.anunciante ? `👤 ${a.anunciante}` : "",
    a.url,
  ]
    .filter(Boolean)
    .join("\n");
}

async function varrerBairro(db: Db, b: Bairro, termos: string[], alertaNumero: string | null) {
  const busca = { nome: b.nome, zona: b.zona, cidade: b.cidade, estado: b.estado };
  const aprendendo = !b.aprendido_em;
  const paginas = aprendendo ? PAGINAS_APRENDIZADO : PAGINAS_MAX_NOVOS;

  // 1. coleta os anúncios novos (do mais recente pro mais antigo)
  const novos: AnuncioZap[] = [];
  for (let p = 0; p < paginas; p++) {
    const lote = await buscarPagina(busca, p);
    if (lote.length === 0) break;
    const { data: conhecidos } = await db.from("radar_anuncios").select("id").in("id", lote.map((a) => a.id));
    const jaVistos = new Set((conhecidos ?? []).map((c) => c.id));
    const ineditos = lote.filter((a) => !jaVistos.has(a.id));
    novos.push(...ineditos);
    // fora do aprendizado, página que já tem anúncio conhecido marca onde parou a última vez
    if (!aprendendo && ineditos.length < lote.length) break;
    await dorme(PAUSA_MS);
  }

  const doTipo = novos.filter((a) => !a.tipo || b.tipos.includes(a.tipo));

  if (aprendendo) {
    // registra pra formar a média; na 1ª passada nada vira alerta de WhatsApp
    if (doTipo.length) {
      await db.from("radar_anuncios").upsert(
        doTipo.map((a) => ({
          id: a.id, portal: "zap", bairro_id: b.id, tipo: a.tipo, titulo: a.titulo, url: a.url,
          preco: a.preco, area: a.area, preco_m2: precoM2(a), anunciante: a.anunciante,
          criado_no_portal: a.criadoNoPortal,
        })),
        { onConflict: "id", ignoreDuplicates: true }
      );
    }
    // com a média formada, já marca as oportunidades por preço dessa 1ª leva (sem abrir cada
    // anúncio — as palavras-chave valem a partir da 2ª busca, que lê a descrição dos novos)
    const refInicial = await medias(db, b.id);
    let oportunidadesIniciais = 0;
    for (const a of doTipo) {
      const m2 = precoM2(a);
      const av = avaliar({
        precoM2: m2,
        tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
        pctAbaixoMedia: Number(b.pct_abaixo_media),
        mediaM2: refInicial[grupoDoTipo(a.tipo)],
        palavras: [],
      });
      if (!av.oportunidade) continue;
      oportunidadesIniciais++;
      await db.from("radar_anuncios").update({ oportunidade: true, motivo: av.motivo, pct_abaixo: av.pctAbaixo }).eq("id", a.id);
    }
    await db.from("radar_bairros").update({ aprendido_em: new Date().toISOString(), ultima_varredura: new Date().toISOString() }).eq("id", b.id);
    await logEvent("info", "bairro aprendido", { bairro: b.nome, anuncios: doTipo.length, oportunidades: oportunidadesIniciais });
    return { novos: doTipo.length, oportunidades: oportunidadesIniciais };
  }

  // 2. analisa cada novo: R$/m² contra a referência + palavras na descrição
  const ref = await medias(db, b.id);
  let oportunidades = 0;
  for (const a of doTipo) {
    let descricao = "";
    try {
      descricao = await buscarDescricao(a.url);
    } catch (err) {
      await logEvent("warn", "não consegui ler a descrição", { id: a.id, error: String(err) });
    }
    await dorme(PAUSA_MS);

    const m2 = precoM2(a);
    const palavras = palavrasEncontradas(`${a.titulo}\n${descricao}`, termos);
    const av = avaliar({
      precoM2: m2,
      tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
      pctAbaixoMedia: Number(b.pct_abaixo_media),
      mediaM2: ref[grupoDoTipo(a.tipo)],
      palavras,
    });

    const { error } = await db.from("radar_anuncios").insert({
      id: a.id, portal: "zap", bairro_id: b.id, tipo: a.tipo, titulo: a.titulo, url: a.url,
      preco: a.preco, area: a.area, preco_m2: m2, descricao, palavras, anunciante: a.anunciante,
      criado_no_portal: a.criadoNoPortal, oportunidade: av.oportunidade, motivo: av.motivo || null,
      pct_abaixo: av.pctAbaixo,
    });
    if (error) continue; // corrida com outra varredura: já foi registrado
    if (!av.oportunidade) continue;
    oportunidades++;

    if (alertaNumero) {
      try {
        await enviarWhatsApp(alertaNumero, textoAlerta(b, a, m2, av.pctAbaixo, av.referenciaM2, palavras));
        await db.from("radar_anuncios").update({ alertado_em: new Date().toISOString() }).eq("id", a.id);
      } catch (err) {
        await logEvent("error", "falha ao enviar alerta", { id: a.id, error: String(err) });
      }
    }
  }

  await db.from("radar_bairros").update({ ultima_varredura: new Date().toISOString() }).eq("id", b.id);
  return { novos: doTipo.length, oportunidades };
}

let rodando = false;

/**
 * Uma busca: os bairros escolhidos (ou todos os ativos, se a lista vier vazia). Sob demanda — só roda quando
 * alguém aperta "Buscar agora". Status e resultado ficam em radar_config pra tela acompanhar.
 */
export async function rodarVarredura(
  opts: { bairroIds?: string[] | null } = {}
): Promise<{ bairros: number; novos: number; oportunidades: number } | null> {
  if (rodando) return null;
  rodando = true;
  const db = createServiceClient();
  await db
    .from("radar_config")
    .update({ busca_status: "rodando", busca_iniciada_em: new Date().toISOString() })
    .eq("id", true);
  try {
    let q = db.from("radar_bairros").select("*").eq("ativo", true);
    if (opts.bairroIds?.length) q = q.in("id", opts.bairroIds);
    const [{ data: config }, { data: bairros }, { data: palavras }] = await Promise.all([
      db.from("radar_config").select("*").eq("id", true).maybeSingle(),
      q,
      db.from("radar_palavras").select("termo").eq("ativo", true),
    ]);

    const termos = (palavras ?? []).map((p) => p.termo);
    const alertaNumero = config?.alerta_numero?.trim() || process.env.RADAR_ALERTA_NUMERO?.trim() || null;
    const total = { bairros: 0, novos: 0, oportunidades: 0 };
    const erros: string[] = [];
    for (const b of bairros ?? []) {
      try {
        const r = await varrerBairro(db, b, termos, alertaNumero);
        total.bairros++;
        total.novos += r.novos;
        total.oportunidades += r.oportunidades;
      } catch (err) {
        erros.push(`${b.nome}: ${String(err).slice(0, 160)}`);
        await logEvent("error", "falha na busca do bairro", { bairro: b.nome, error: String(err) });
      }
    }
    await logEvent("info", "busca concluída", { ...total, erros: erros.length });
    await db
      .from("radar_config")
      .update({ busca_status: erros.length && !total.bairros ? "erro" : "concluida", busca_resultado: { ...total, erros } })
      .eq("id", true);
    return total;
  } catch (err) {
    await db.from("radar_config").update({ busca_status: "erro", busca_resultado: { erro: String(err) } }).eq("id", true);
    throw err;
  } finally {
    rodando = false;
  }
}
