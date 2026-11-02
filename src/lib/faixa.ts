import type { createServiceClient } from "@/lib/supabase/service";

type Db = ReturnType<typeof createServiceClient>;

/**
 * Tira da lista as oportunidades do bairro que ficaram fora da faixa de valor (quando o Gines
 * cria ou aperta a faixa). O caminho de volta — faixa alargada — é da reavaliação no fim da
 * busca, que reconfere quem tem motivo "fora da faixa de valor".
 */
export async function aplicarFaixa(db: Db, bairroId: string, precoMin: number | null, precoMax: number | null) {
  const fora = { oportunidade: false, motivo: "fora da faixa de valor" };
  if (precoMin) {
    await db.from("radar_anuncios").update(fora).eq("bairro_id", bairroId).eq("oportunidade", true).lt("preco", precoMin);
  }
  if (precoMax) {
    await db.from("radar_anuncios").update(fora).eq("bairro_id", bairroId).eq("oportunidade", true).gt("preco", precoMax);
  }
}
