/**
 * Coletor local do radar.
 *
 * Os portais (ZAP, OLX...) bloqueiam o IP do servidor (Cloudflare, confirmado em 06/10/26 —
 * nem Chromium real passa). Então a varredura roda numa máquina com internet residencial:
 * este processo lê os portais, grava no Supabase e manda os alertas. O painel continua no
 * servidor e mostra se o coletor está vivo (radar_config.coletor_visto_em).
 *
 * Rodar:  npm run coletor        (precisa do arquivo .env.coletor ao lado do package.json)
 * Parar:  Ctrl+C
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

// carrega .env.coletor antes de importar o resto (o client do Supabase lê o env na criação)
for (const linha of readFileSync(join(process.cwd(), ".env.coletor"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BATIMENTO_MS = 60_000;

async function main() {
  const { rodarVarredura } = await import("../src/lib/varredura");
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const { logEvent } = await import("../src/lib/log");
  const db = createServiceClient();
  const maquina = hostname();

  await logEvent("info", "coletor local iniciado", { maquina });
  console.log(`[coletor] iniciado em ${maquina}. Ctrl+C para parar.`);

  let ultima = 0;
  const ciclo = async () => {
    try {
      const { data: cfg } = await db.from("radar_config").select("intervalo_min,ativo").eq("id", true).maybeSingle();
      await db
        .from("radar_config")
        .update({ coletor_visto_em: new Date().toISOString(), coletor_host: maquina })
        .eq("id", true);
      const intervaloMs = Math.max(10, cfg?.intervalo_min ?? 30) * 60_000;
      if (!cfg?.ativo || Date.now() - ultima < intervaloMs) return;
      ultima = Date.now();
      const r = await rodarVarredura();
      console.log(`[coletor] ${new Date().toLocaleString("pt-BR")} varredura:`, r);
    } catch (err) {
      console.error("[coletor] erro:", err);
      await logEvent("error", "falha no coletor local", { maquina, error: String(err) });
    }
  };

  await ciclo();
  setInterval(ciclo, BATIMENTO_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
