/**
 * Coletor local do radar — executa as buscas pedidas no botão "Buscar agora".
 *
 * Os portais bloqueiam o IP do servidor (Cloudflare), então quem acessa é esta máquina, com
 * internet residencial. Ele NÃO busca sozinho: fica parado conferindo a cada 10s se alguém
 * pediu uma busca e, se sim, executa. Também avisa o painel que está online.
 *
 * Rodar:  npm run coletor        (precisa do arquivo .env.coletor ao lado do package.json)
 * Parar:  Ctrl+C
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

for (const linha of readFileSync(join(process.cwd(), ".env.coletor"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { atenderPedidoPendente } = await import("../src/lib/pedidos");
  const { createServiceClient } = await import("../src/lib/supabase/service");
  const { logEvent } = await import("../src/lib/log");
  const db = createServiceClient();
  const maquina = hostname();

  await logEvent("info", "coletor local conectado", { maquina });
  console.log(`[coletor] conectado em ${maquina}, esperando o botão "Buscar agora". Ctrl+C para parar.`);

  let ocupado = false;
  let ultimoSinal = 0;
  const ciclo = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      if (Date.now() - ultimoSinal > 60_000) {
        ultimoSinal = Date.now();
        await db.from("radar_config").update({ coletor_visto_em: new Date().toISOString(), coletor_host: maquina }).eq("id", true);
      }
      if (await atenderPedidoPendente(`coletor ${maquina}`)) {
        console.log(`[coletor] ${new Date().toLocaleString("pt-BR")} busca concluída`);
        ultimoSinal = 0;
      }
    } catch (err) {
      console.error("[coletor] erro:", err);
      await logEvent("error", "falha no coletor local", { maquina, error: String(err) });
    } finally {
      ocupado = false;
    }
  };

  await ciclo();
  setInterval(ciclo, 10_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
