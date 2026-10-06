"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function autenticado() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
function numeroOuNulo(f: FormData, k: string): number | null {
  const bruto = texto(f, k).replace(/\./g, "").replace(",", ".");
  if (!bruto) return null;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Valor inválido em ${k}`);
  return n;
}

// ---- bairros -------------------------------------------------------------

export async function salvarBairro(formData: FormData) {
  const supabase = await autenticado();
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
    cidade: texto(formData, "cidade") || "São Paulo",
    estado: texto(formData, "estado") || "São Paulo",
    teto_m2: numeroOuNulo(formData, "teto_m2"),
    pct_abaixo_media: pct,
    tipos,
  };
  const { error } = id
    ? await supabase.from("radar_bairros").update(linha).eq("id", id)
    : await supabase.from("radar_bairros").insert(linha);
  if (error) throw new Error(error.code === "23505" ? "Esse bairro já está cadastrado" : error.message);
  revalidatePath("/bairros");
}

export async function alternarBairro(id: string, ativo: boolean) {
  const supabase = await autenticado();
  const { error } = await supabase.from("radar_bairros").update({ ativo }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bairros");
}

export async function removerBairro(id: string) {
  const supabase = await autenticado();
  const { error } = await supabase.from("radar_bairros").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bairros");
}

// ---- palavras-chave ------------------------------------------------------

export async function adicionarPalavra(formData: FormData) {
  const supabase = await autenticado();
  const termo = texto(formData, "termo").toLowerCase();
  if (termo.length < 3) throw new Error("Palavra muito curta");
  const { error } = await supabase
    .from("radar_palavras")
    .insert({ termo, categoria: texto(formData, "categoria") || "outro" });
  if (error && error.code !== "23505") throw new Error(error.message);
  revalidatePath("/bairros");
}

export async function removerPalavra(id: string) {
  const supabase = await autenticado();
  const { error } = await supabase.from("radar_palavras").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/bairros");
}

// ---- oportunidades -------------------------------------------------------

export async function descartarAnuncio(id: string) {
  const supabase = await autenticado();
  const { error } = await supabase.from("radar_anuncios").update({ descartado: true }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/oportunidades");
}

// ---- configuração --------------------------------------------------------

export async function salvarConfig(formData: FormData) {
  const supabase = await autenticado();
  const intervalo = Math.round(numeroOuNulo(formData, "intervalo_min") ?? 30);
  if (intervalo < 10) throw new Error("Intervalo mínimo é 10 minutos");
  const numero = texto(formData, "alerta_numero").replace(/[^\d@.a-z]/gi, "");
  const { error } = await supabase.from("radar_config").upsert({
    id: true,
    ativo: formData.get("ativo") === "on",
    intervalo_min: intervalo,
    alerta_numero: numero || null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/config");
}
