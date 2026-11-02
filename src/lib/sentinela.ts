import { createServiceClient } from "@/lib/supabase/service";
import { logEvent } from "./log";

/**
 * Sentinela (pedido do Gines, 26/10/26): uma busca automática por dia, no horário escolhido na
 * aba Alertas, em todos os bairros ativos — os alertas de WhatsApp saem como numa busca normal.
 *
 * Não executa nada: só grava o pedido de busca, igual ao botão "Buscar", e quem já atende os
 * pedidos (servidor com proxy) roda. A marcação do dia é atômica: o pedido sai uma vez só.
 */
export async function verificarSentinela(): Promise<boolean> {
  const agora = new Date();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora); // AAAA-MM-DD
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(agora));

  const db = createServiceClient();
  const { data: cfg } = await db.from("radar_config").select("sentinela_ativa,sentinela_hora,sentinela_ultima").eq("id", true).maybeSingle();
  if (!cfg?.sentinela_ativa || cfg.sentinela_ultima === hoje || hora < cfg.sentinela_hora) return false;

  // pega o dia de forma atômica e só se não houver busca em andamento (a do dia espera ela acabar)
  const { data } = await db
    .from("radar_config")
    .update({
      sentinela_ultima: hoje,
      busca_status: "aguardando",
      busca_solicitada_em: agora.toISOString(),
      busca_bairros: null, // todos os bairros ativos
      busca_resultado: null,
    })
    .eq("id", true)
    .or(`sentinela_ultima.is.null,sentinela_ultima.neq.${hoje}`)
    .not("busca_status", "in", "(aguardando,rodando)")
    .select("id");
  if (!data?.length) return false;
  await logEvent("info", "busca automática do dia pedida", { dia: hoje, hora });
  return true;
}
