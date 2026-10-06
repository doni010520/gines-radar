import { NextResponse } from "next/server";

const INICIADO_EM = new Date().toISOString();

export function GET() {
  const agendador = (globalThis as { __radarScheduler?: string }).__radarScheduler ?? "nao-armado";
  return NextResponse.json({ ok: true, app: "gines-radar", processoIniciadoEm: INICIADO_EM, agendador }, { headers: { "cache-control": "no-store" } });
}
