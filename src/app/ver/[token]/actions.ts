"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

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

export async function salvarBairro(token: string, formData: FormData) {
  const db = validar(token);
  const id = texto(formData, "id");
  const nome = texto(formData, "nome");
  if (!nome) throw new Error("Informe o nome do bairro");
  const pct = numeroOuNulo(formData, "pct_abaixo_media") ?? 40;
  if (pct >= 95) throw new Error("% abaixo da média precisa ser menor que 95");
  const tipos = formData.getAll("tipos").map(String).filter(Boolean);
  if (tipos.length === 0) throw new Error("Marque pelo menos um tipo de imóvel");
  const linha = {
    nome,
    zona: texto(formData, "zona"),
    teto_m2: numeroOuNulo(formData, "teto_m2"),
    pct_abaixo_media: pct,
    tipos,
  };
  const { error } = id
    ? await db.from("radar_bairros").update(linha).eq("id", id)
    : await db.from("radar_bairros").insert(linha);
  if (error) throw new Error(error.code === "23505" ? "Esse bairro já está cadastrado" : error.message);
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

/** Botão "Buscar agora": registra o pedido; quem executa é o coletor local (ou o servidor com proxy). */
export async function pedirBusca(token: string, bairroId: string | null) {
  const db = validar(token);
  const { data: cfg } = await db.from("radar_config").select("busca_status").eq("id", true).maybeSingle();
  if (cfg?.busca_status === "rodando" || cfg?.busca_status === "aguardando") return;
  await db
    .from("radar_config")
    .update({
      busca_status: "aguardando",
      busca_solicitada_em: new Date().toISOString(),
      busca_bairro_id: bairroId,
      busca_resultado: null,
    })
    .eq("id", true);
  revalidatePath(`/ver/${token}`);
}

export async function salvarNumero(token: string, formData: FormData) {
  const db = validar(token);
  const numero = texto(formData, "alerta_numero").replace(/[^\d@.a-z]/gi, "");
  await db.from("radar_config").update({ alerta_numero: numero || null }).eq("id", true);
  revalidatePath(`/ver/${token}`);
}
