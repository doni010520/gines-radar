import { createServiceClient } from "@/lib/supabase/service";
import { rodarVarredura } from "./varredura";
import { logEvent } from "./log";

/**
 * Atende o pedido de busca pendente (botão "Buscar agora"), se houver.
 * Usado por quem consegue acessar os portais: o coletor local, ou o servidor quando tiver
 * proxy residencial (RADAR_PROXY). Nunca busca sem pedido.
 */
export async function atenderPedidoPendente(executor: string): Promise<boolean> {
  const db = createServiceClient();
  // "pega" o pedido de forma atômica: só um executor muda aguardando -> rodando
  const { data } = await db
    .from("radar_config")
    .update({ busca_status: "rodando", busca_iniciada_em: new Date().toISOString() })
    .eq("id", true)
    .eq("busca_status", "aguardando")
    .select("busca_bairros")
    .maybeSingle();
  if (!data) return false;

  await logEvent("info", "busca iniciada", { executor, bairros: data.busca_bairros ?? "todos" });
  await rodarVarredura({ bairroIds: data.busca_bairros });
  return true;
}
