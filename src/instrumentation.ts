/**
 * No servidor, a busca só roda sob demanda (botão) e só se houver proxy residencial
 * (RADAR_PROXY) — sem ele os portais bloqueiam o IP do servidor e quem atende é o coletor local.
 * Não existe varredura automática.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.RADAR_PROXY) return;

  const { atenderPedidoPendente } = await import("@/lib/pedidos");
  const { logEvent } = await import("@/lib/log");

  const { createServiceClient } = await import("@/lib/supabase/service");
  const db = createServiceClient();

  let ocupado = false;
  let ultimoSinal = 0;
  setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      // sinal de vida: a tela mostra "online" e sabe que tem quem execute o botão Buscar
      if (Date.now() - ultimoSinal > 60_000) {
        ultimoSinal = Date.now();
        await db.from("radar_config").update({ coletor_visto_em: new Date().toISOString(), coletor_host: "servidor (proxy)" }).eq("id", true);
      }
      if (await atenderPedidoPendente("servidor (proxy)")) ultimoSinal = 0;
    } catch (err) {
      await logEvent("error", "falha ao atender pedido de busca", { error: String(err) });
    } finally {
      ocupado = false;
    }
  }, 10_000);

  (globalThis as { __radarScheduler?: string }).__radarScheduler = new Date().toISOString();
}
