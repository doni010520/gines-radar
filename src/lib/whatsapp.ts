/** Envio de texto pela UAZAPI (mesma instância do atendimento ou outra, via env). */
export async function enviarWhatsApp(numero: string, texto: string) {
  const base = process.env.UAZAPI_BASE_URL;
  const token = process.env.UAZAPI_TOKEN;
  if (!base || !token) throw new Error("UAZAPI_BASE_URL/UAZAPI_TOKEN não configurados");
  // grupo (@g.us) vai como está; telefone só com dígitos
  const destino = numero.includes("@") ? numero.trim() : numero.replace(/\D/g, "");
  const res = await fetch(`${base.replace(/\/$/, "")}/send/text`, {
    method: "POST",
    headers: { token, "Content-Type": "application/json" },
    body: JSON.stringify({ number: destino, text: texto }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`uazapi /send/text ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
