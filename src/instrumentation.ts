/**
 * Agendador do radar: a cada minuto confere se já passou o intervalo configurado no painel
 * (radar_config.intervalo_min) desde a última rodada e, se passou, varre os bairros ativos.
 * Roda dentro do próprio servidor — não depende de cron externo.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.RADAR_SCHEDULER === "off") return;

  const { rodarVarredura } = await import("@/lib/varredura");
  const { createServiceClient } = await import("@/lib/supabase/service");
  const { logEvent } = await import("@/lib/log");

  let ultima = 0;
  setInterval(async () => {
    try {
      const { data } = await createServiceClient().from("radar_config").select("intervalo_min").eq("id", true).maybeSingle();
      const intervaloMs = Math.max(10, data?.intervalo_min ?? 30) * 60_000;
      if (Date.now() - ultima < intervaloMs) return;
      ultima = Date.now();
      await rodarVarredura();
    } catch (err) {
      await logEvent("error", "falha no agendador", { error: String(err) });
    }
  }, 60_000);

  (globalThis as { __radarScheduler?: string }).__radarScheduler = new Date().toISOString();
  await logEvent("info", "agendador do radar iniciado");
}
