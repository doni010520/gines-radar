import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";
import { FONTES, type Anuncio, type Fonte, type Variante } from "./fontes";
import { consumo } from "./fontes/http";
import { fecharNavegadores } from "./fontes/navegador";
import { avaliar, calcularReferencias, motivoExclusao, palavrasEncontradas, referenciaDe, type Referencias } from "./analise";
import { enviarWhatsApp } from "./whatsapp";
import { logEvent } from "./log";

type Db = ReturnType<typeof createServiceClient>;
type Bairro = Database["public"]["Tables"]["radar_bairros"]["Row"];

/** Pausa entre uma requisição e outra ao mesmo portal — não martelar. */
const PAUSA_MS = 1500;
/** Descrições abertas ao mesmo tempo, por portal (a fonte pode pedir menos). */
const DESCRICOES_EM_PARALELO = 4;

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Preço por m², ou null quando o anúncio tem preço/área simbólicos ("R$ 1", "sob consulta",
 * área 1 m²) — esses viravam "100% abaixo da média" e poluíam a lista.
 */
function precoM2(a: Anuncio): number | null {
  if (!a.preco || !a.area || a.preco < 30_000 || a.area < 10) return null;
  const m2 = Math.round(a.preco / a.area);
  return m2 >= 500 ? m2 : null;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * Medianas de R$/m² do bairro (por tipo e por tipo + faixa de tamanho), com os anúncios vistos
 * nos últimos 180 dias em todos os portais. Sem amostra suficiente não há referência (só
 * palavras-chave valem) — completar com outro grupo distorceria a comparação.
 */
async function medias(db: Db, bairroId: string): Promise<Referencias> {
  const desde = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  // o banco devolve no máximo 1000 linhas por consulta: pagina (Pinheiros já passa de 1700)
  const linhas: { tipo: string | null; area: number | null; preco_m2: number | null }[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await db
      .from("radar_anuncios")
      .select("tipo,area,preco_m2")
      .eq("bairro_id", bairroId)
      .gte("visto_em", desde)
      .not("preco_m2", "is", null)
      .order("id")
      .range(de, de + 999);
    for (const r of data ?? []) {
      linhas.push({ tipo: r.tipo, area: r.area === null ? null : Number(r.area), preco_m2: r.preco_m2 === null ? null : Number(r.preco_m2) });
    }
    if (!data || data.length < 1000) break;
  }
  return calcularReferencias(linhas);
}

/**
 * O mesmo imóvel costuma estar anunciado por várias imobiliárias e em vários portais (ids
 * diferentes, mesma área e preço igual ou quase — já apareceu R$ 1.200.000 x R$ 1.200.100, e a
 * mesma casa a R$ 815 mil no QuintoAndar e R$ 839 mil na Loft).
 * Devolve o id da oportunidade que já representa esse imóvel no bairro, se houver.
 */
async function mesmaOportunidade(db: Db, bairroId: string, a: Anuncio): Promise<string | null> {
  if (!a.preco || !a.area) return null;
  const { data } = await db
    .from("radar_anuncios")
    .select("id")
    .eq("bairro_id", bairroId)
    .eq("oportunidade", true)
    .eq("area", a.area)
    .gte("preco", a.preco * 0.95)
    .lte("preco", a.preco * 1.05)
    .neq("id", a.id)
    .limit(1);
  return data?.[0]?.id ?? null;
}

function textoAlerta(b: Bairro, f: Fonte, a: Anuncio, m2: number | null, pct: number | null, ref: number | null, palavras: string[]) {
  return [
    `🏚️ *Oportunidade — ${b.nome}* (${f.nome})`,
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

/** Margem abaixo do corte em que já vale ler a descrição (corte 50% → abre a partir de 30%). */
const MARGEM_DESCRICAO = 20;

/**
 * Vale abrir a página do anúncio? Sim se o preço já está a até MARGEM_DESCRICAO pontos do corte
 * (ou perto do teto), se o bairro ainda não tem referência pra esse tipo (aí só a palavra-chave
 * decide) ou se o título já cita palavra-chave. Anúncio caro não vira oportunidade nem com
 * "reforma" no texto — o Gines quer desconto real.
 */
function precisaDescricao(a: Anuncio, b: Bairro, ref: Referencias, termos: string[]): boolean {
  if (palavrasEncontradas(a.titulo, termos).length) return true;
  const m2 = precoM2(a);
  if (!m2) return false;
  if (b.teto_m2) return m2 <= Number(b.teto_m2) * 1.25;
  const media = referenciaDe(ref, a.tipo, a.area);
  if (!media) return true;
  return (1 - m2 / media) * 100 >= Number(b.pct_abaixo_media) - MARGEM_DESCRICAO;
}

/**
 * Um bairro num portal: uma passada por variante (o ZAP busca casa, apartamento, terreno...
 * separados); portal sem variantes faz uma passada só. Cada variante aprende a média uma vez —
 * fica registrada em radar_bairros.aprendido_variantes como "<portal>:<variante>".
 */
async function varrerBairroNaFonte(db: Db, b: Bairro, f: Fonte, termos: string[], alertaNumero: string | null) {
  const lista: (Variante | undefined)[] = f.variantes ? f.variantes(b.tipos) : [undefined];
  const total = { novos: 0, oportunidades: 0 };
  for (const v of lista) {
    const marca = `${f.portal}:${v?.chave ?? "*"}`;
    const aprendendo = !b.aprendido_variantes.includes(marca);
    const r = await varrerVariante(db, b, f, v, aprendendo, termos, alertaNumero);
    total.novos += r.novos;
    total.oportunidades += r.oportunidades;
    if (aprendendo) {
      b.aprendido_variantes = [...b.aprendido_variantes, marca];
      await db.from("radar_bairros").update({ aprendido_variantes: b.aprendido_variantes }).eq("id", b.id);
    }
  }
  return total;
}

async function varrerVariante(
  db: Db,
  b: Bairro,
  f: Fonte,
  variante: Variante | undefined,
  aprendendo: boolean,
  termos: string[],
  alertaNumero: string | null
) {
  const busca = { nome: b.nome, zona: b.zona, cidade: b.cidade, estado: b.estado };
  const paginas = aprendendo ? f.paginasAprendizado : f.paginasNovos;

  // 1. coleta os anúncios ainda não vistos
  const novos: Anuncio[] = [];
  const nestaBusca = new Set<string>(); // portal que repete anúncio entre páginas
  for (let p = 0; p < paginas; p++) {
    const lote = (await f.buscarPagina(busca, p, variante)).filter((a) => !nestaBusca.has(a.id));
    if (lote.length === 0) break;
    lote.forEach((a) => nestaBusca.add(a.id));
    const { data: conhecidos } = await db.from("radar_anuncios").select("id").in("id", lote.map((a) => a.id));
    const jaVistos = new Set((conhecidos ?? []).map((c) => c.id));
    const ineditos = lote.filter((a) => !jaVistos.has(a.id));
    novos.push(...ineditos);
    // portal ordenado por data: página com anúncio conhecido marca onde parou a última vez
    if (!aprendendo && f.ordenadoPorRecentes && ineditos.length < lote.length) break;
    await dorme(f.pausaMs ?? PAUSA_MS);
  }

  // sem tipo residencial (comercial, prédio, rural) fica de fora — nem entra na média
  const doTipo = novos.filter((a) => a.tipo && b.tipos.includes(a.tipo));

  if (aprendendo) {
    // registra pra formar a média; na 1ª passada nada vira alerta de WhatsApp
    if (doTipo.length) {
      await db.from("radar_anuncios").upsert(
        doTipo.map((a) => ({
          id: a.id, portal: f.portal, bairro_id: b.id, tipo: a.tipo, titulo: a.titulo, url: a.url,
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
      const av = avaliar({
        precoM2: precoM2(a),
        tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
        pctAbaixoMedia: Number(b.pct_abaixo_media),
        mediaM2: referenciaDe(refInicial, a.tipo, a.area),
        palavras: [],
      });
      if (!av.oportunidade) continue;
      // leilão / imóvel de banco: critério de exclusão do Gines (na 1ª leva só há título e anunciante)
      const exclusao = motivoExclusao(`${a.titulo}\n${a.anunciante ?? ""}`, a.titulo);
      if (exclusao) {
        await db.from("radar_anuncios").update({ motivo: `excluído: ${exclusao}` }).eq("id", a.id);
        continue;
      }
      if (await mesmaOportunidade(db, b.id, a)) continue;
      oportunidadesIniciais++;
      await db.from("radar_anuncios").update({ oportunidade: true, motivo: av.motivo, pct_abaixo: av.pctAbaixo }).eq("id", a.id);
    }
    await logEvent("info", "bairro aprendido", {
      bairro: b.nome,
      portal: f.portal,
      variante: variante?.chave ?? null,
      anuncios: doTipo.length,
      oportunidades: oportunidadesIniciais,
    });
    return { novos: doTipo.length, oportunidades: oportunidadesIniciais };
  }

  // 2. analisa cada novo: R$/m² contra a referência + palavras na descrição
  const ref = await medias(db, b.id);
  // descrições em paralelo (o proxy rotativo dá um IP por requisição): 126 anúncios novos
  // levavam ~10 min um a um (15/10/26)
  const descricoes = new Map<string, string>();
  const paralelo = f.descricoesEmParalelo ?? DESCRICOES_EM_PARALELO;
  // a página do anúncio é o que mais gasta proxy (300 KB a 1 MB cada): só abre de quem já está
  // perto de ser oportunidade pelo preço, ou já cita palavra-chave no título (15/10/26)
  const abrir = doTipo.filter((a) => precisaDescricao(a, b, ref, termos));
  for (let i = 0; i < abrir.length; i += paralelo) {
    await Promise.all(
      abrir.slice(i, i + paralelo).map(async (a) => {
        try {
          descricoes.set(a.id, await f.buscarDescricao(a.url));
        } catch (err) {
          await logEvent("warn", "não consegui ler a descrição", { id: a.id, error: String(err) });
        }
      })
    );
    await dorme(f.pausaMs ?? PAUSA_MS);
  }

  let oportunidades = 0;
  for (const a of doTipo) {
    const descricao = descricoes.get(a.id) ?? "";
    const m2 = precoM2(a);
    const palavras = palavrasEncontradas(`${a.titulo}\n${descricao}`, termos);
    const av = avaliar({
      precoM2: m2,
      tetoM2: b.teto_m2 ? Number(b.teto_m2) : null,
      pctAbaixoMedia: Number(b.pct_abaixo_media),
      mediaM2: referenciaDe(ref, a.tipo, a.area),
      palavras,
    });
    const exclusao = av.oportunidade ? motivoExclusao(`${a.titulo}\n${a.anunciante ?? ""}\n${descricao}`, a.titulo) : null;
    const repetido = av.oportunidade && !exclusao ? await mesmaOportunidade(db, b.id, a) : null;
    if (exclusao) {
      av.oportunidade = false;
      av.motivo = `excluído: ${exclusao}`;
    } else if (repetido) {
      av.oportunidade = false;
      av.motivo = `mesmo imóvel de ${repetido} (outro anúncio)`;
    }

    const { error } = await db.from("radar_anuncios").insert({
      id: a.id, portal: f.portal, bairro_id: b.id, tipo: a.tipo, titulo: a.titulo, url: a.url,
      preco: a.preco, area: a.area, preco_m2: m2, descricao, palavras, anunciante: a.anunciante,
      criado_no_portal: a.criadoNoPortal, oportunidade: av.oportunidade, motivo: av.motivo || null,
      pct_abaixo: av.pctAbaixo,
    });
    if (error) continue; // corrida com outra varredura: já foi registrado
    if (!av.oportunidade) continue;
    oportunidades++;

    if (alertaNumero) {
      try {
        await enviarWhatsApp(alertaNumero, textoAlerta(b, f, a, m2, av.pctAbaixo, av.referenciaM2, palavras));
        await db.from("radar_anuncios").update({ alertado_em: new Date().toISOString() }).eq("id", a.id);
      } catch (err) {
        await logEvent("error", "falha ao enviar alerta", { id: a.id, error: String(err) });
      }
    }
  }
  return { novos: doTipo.length, oportunidades };
}

let rodando = false;

/**
 * Uma busca: os bairros escolhidos (ou todos os ativos, se a lista vier vazia), em todas as
 * fontes. Sob demanda — só roda quando alguém aperta "Buscar". Status e resultado ficam em
 * radar_config pra tela acompanhar. Portal que falha não derruba os outros.
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
    const proxyAntes = consumo.proxy.bytes;
    const diretoAntes = consumo.direto.bytes;
    const alertaNumero = config?.alerta_numero?.trim() || process.env.RADAR_ALERTA_NUMERO?.trim() || null;
    const total = { bairros: 0, novos: 0, oportunidades: 0 };
    const porPortal: Record<string, number> = {};
    const erros: string[] = [];
    for (const b of bairros ?? []) {
      let algumPortalOk = false;
      for (const f of FONTES) {
        try {
          const r = await varrerBairroNaFonte(db, b, f, termos, alertaNumero);
          algumPortalOk = true;
          total.novos += r.novos;
          total.oportunidades += r.oportunidades;
          porPortal[f.nome] = (porPortal[f.nome] ?? 0) + r.novos;
        } catch (err) {
          erros.push(`${b.nome} (${f.nome}): ${String(err).slice(0, 160)}`);
          await logEvent("error", "falha na busca do bairro", { bairro: b.nome, portal: f.portal, error: String(err) });
        }
      }
      if (algumPortalOk) {
        total.bairros++;
        const agora = new Date().toISOString();
        await db
          .from("radar_bairros")
          .update({ ultima_varredura: agora, ...(b.aprendido_em ? {} : { aprendido_em: agora }) })
          .eq("id", b.id);
      }
    }
    // MB gastos nesta busca (o plano do proxy é por GB)
    const trafego = {
      proxyMB: Math.round(((consumo.proxy.bytes - proxyAntes) / 1e6) * 10) / 10,
      diretoMB: Math.round(((consumo.direto.bytes - diretoAntes) / 1e6) * 10) / 10,
    };
    await logEvent("info", "busca concluída", { ...total, porPortal, ...trafego, erros: erros.length });
    await db
      .from("radar_config")
      .update({ busca_status: erros.length && !total.bairros ? "erro" : "concluida", busca_resultado: { ...total, porPortal, ...trafego, erros } })
      .eq("id", true);
    return total;
  } catch (err) {
    await db.from("radar_config").update({ busca_status: "erro", busca_resultado: { erro: String(err) } }).eq("id", true);
    throw err;
  } finally {
    rodando = false;
    // OLX / Mercado Livre abrem um Chromium (~400 MB): não fica aberto entre buscas
    await fecharNavegadores();
  }
}
