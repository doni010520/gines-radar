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

  let ocupado = false;
  setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await atenderPedidoPendente("servidor (proxy)");
    } catch (err) {
      await logEvent("error", "falha ao atender pedido de busca", { error: String(err) });
    } finally {
      ocupado = false;
    }
  }, 10_000);

  (globalThis as { __radarScheduler?: string }).__radarScheduler = new Date().toISOString();
}
