"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { aplicarFaixa } from "@/lib/faixa";
import { ESTADOS, nomeProprio } from "@/lib/estados";

/**
 * Ações do link sem login. Cada uma confere o segredo do link (RADAR_SHARE_TOKEN) antes de
 * mexer em qualquer coisa — sem ele, nada acontece.
 */
function validar(token: string) {
  if (!process.env.RADAR_SHARE_TOKEN || token !== process.env.RADAR_SHARE_TOKEN) {
    throw new Error("Link inválido");
  }
  return createServiceClient();
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function numeroOuNulo(f: FormData, k: string): number | null {
  const bruto = texto(f, k).replace(/\./g, "").replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Valor inválido em ${k}`);
  return n;
}

/**
 * Valor em reais digitado do jeito que vier: "800000", "800.000", "R$ 1.500.000,00",
 * "800 mil", "1,5 mi". Vazio = sem limite.
 */
function valorEmReais(f: FormData, k: string): number | null {
  const bruto = texto(f, k).toLowerCase();
  if (!bruto) return null;
  const mult = /\bmi(lh[aã]o|lh[oõ]es)?\b|\bmi$/.test(bruto) ? 1e6 : /\bmil\b/.test(bruto) ? 1e3 : 1;
  let n = bruto.replace(/[^\d,.]/g, "");
  // "1,5" com milhão/mil → decimal; "1.500.000,00" → separador de milhar
  n = mult > 1 ? n.replace(/\./g, "").replace(",", ".") : n.replace(/\./g, "").replace(/,\d{0,2}$/, "");
  const v = Number(n) * mult;
  if (!Number.isFinite(v) || v <= 0) throw new Error(`Valor inválido: ${texto(f, k)}`);
  return Math.round(v);
}

export async function salvarBairro(token: string, formData: FormData) {
  const db = validar(token);
  const id = texto(formData, "id");
  // "sem bairro definido" = cidade inteira, gravado com nome vazio
  const cidadeInteira = formData.get("cidade_inteira") === "on";
  const nome = cidadeInteira ? "" : nomeProprio(texto(formData, "nome"));
  if (!nome && !cidadeInteira) throw new Error("Informe o bairro ou marque “sem bairro definido”");
  const cidade = nomeProprio(texto(formData, "cidade"));
  const estado = texto(formData, "estado");
  if (!cidade) throw new Error("Informe a cidade");
  if (!ESTADOS.some(([n]) => n === estado)) throw new Error("Escolha o estado");
  const pct = numeroOuNulo(formData, "pct_abaixo_media") ?? 50;
  if (pct >= 95) throw new Error("% abaixo da média precisa ser menor que 95");
  const tipos = formData.getAll("tipos").map(String).filter(Boolean);
  if (tipos.length === 0) throw new Error("Marque pelo menos um tipo de imóvel");
  const linha = {
    nome,
    zona: texto(formData, "zona"),
    cidade,
    estado,
    teto_m2: numeroOuNulo(formData, "teto_m2"),
    pct_abaixo_media: pct,
    tipos,
    preco_min: valorEmReais(formData, "preco_min"),
    preco_max: valorEmReais(formData, "preco_max"),
  };
  if (linha.preco_min && linha.preco_max && linha.preco_min > linha.preco_max) {
    throw new Error("O valor mínimo está maior que o máximo");
  }
  // trocou o nome ou a cidade: é outro lugar nos portais — some o aviso de nome e reaprende a média
  const anterior = id ? (await db.from("radar_bairros").select("nome,cidade").eq("id", id).maybeSingle()).data : null;
  const outroLugar = anterior && (anterior.nome !== linha.nome || anterior.cidade !== linha.cidade);
  const { error } = id
    ? await db
        .from("radar_bairros")
        .update({ ...linha, ...(outroLugar ? { sugestoes: null, aprendido_em: null } : {}) })
        .eq("id", id)
    : await db.from("radar_bairros").insert(linha);
  if (error) throw new Error(error.code === "23505" ? "Esse bairro já está cadastrado" : error.message);
  // faixa nova/apertada: o que ficou fora some da lista já, sem esperar a próxima busca
  if (id) await aplicarFaixa(db, id, linha.preco_min, linha.preco_max);
  revalidatePath(`/ver/${token}`);
}

export async function alternarBairro(token: string, id: string, ativo: boolean) {
  const db = validar(token);
  await db.from("radar_bairros").update({ ativo }).eq("id", id);
  revalidatePath(`/ver/${token}`);
}

export async function removerBairro(token: string, id: string) {
  const db = validar(token);
  await db.from("radar_bairros").delete().eq("id", id);
  revalidatePath(`/ver/${token}`);
}

export async function adicionarPalavra(token: string, formData: FormData) {
  const db = validar(token);
  const termo = texto(formData, "termo").toLowerCase();
  if (termo.length < 3) throw new Error("Palavra muito curta");
  await db.from("radar_palavras").insert({ termo });
  revalidatePath(`/ver/${token}`);
}

export async function removerPalavra(token: string, id: string) {
  const db = validar(token);
  await db.from("radar_palavras").delete().eq("id", id);
  revalidatePath(`/ver/${token}`);
}

export async function descartar(token: string, id: string) {
  const db = validar(token);
  await db.from("radar_anuncios").update({ descartado: true }).eq("id", id);
  revalidatePath(`/ver/${token}`);
}

/** Botão "Buscar": grava o pedido com os bairros marcados; quem executa é o coletor local (ou o servidor com proxy). */
export async function pedirBusca(token: string, formData: FormData) {
  const db = validar(token);
  const bairros = formData.getAll("bairros").map(String).filter(Boolean);
  if (bairros.length === 0) throw new Error("Marque pelo menos um bairro");
  const { data: cfg } = await db.from("radar_config").select("busca_status").eq("id", true).maybeSingle();
  if (cfg?.busca_status === "rodando" || cfg?.busca_status === "aguardando") return;
  await db
    .from("radar_config")
    .update({
      busca_status: "aguardando",
      busca_solicitada_em: new Date().toISOString(),
      busca_bairros: bairros,
      busca_resultado: null,
    })
    .eq("id", true);
  revalidatePath(`/ver/${token}`);
}

/** Número com DDD sem o 55 ("19988094098") ganha o 55; grupo (@g.us) vai como está. */
function numeroWhatsApp(bruto: string): string | null {
  const t = bruto.trim();
  if (!t) return null;
  if (t.includes("@")) return t;
  const d = t.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 ? d : null;
}

/** Aba Alertas: números que recebem as oportunidades + busca automática diária. */
export async function salvarAlertas(token: string, formData: FormData) {
  const db = validar(token);
  const linhas = texto(formData, "alerta_numeros").split(/[\n,;]+/);
  const numeros = [...new Set(linhas.map(numeroWhatsApp).filter((n): n is string => !!n))];
  const hora = Math.min(23, Math.max(0, Number(texto(formData, "sentinela_hora")) || 9));
  await db
    .from("radar_config")
    .update({
      alerta_numeros: numeros,
      alerta_numero: numeros[0] ?? null,
      sentinela_ativa: formData.get("sentinela_ativa") === "on",
      sentinela_hora: hora,
    })
    .eq("id", true);
  revalidatePath(`/ver/${token}`);
}
