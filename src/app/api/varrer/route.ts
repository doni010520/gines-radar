import { NextRequest, NextResponse } from "next/server";
import { rodarVarredura } from "@/lib/varredura";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Disparo manual de uma rodada (teste/depuração). POST /api/varrer?token=RADAR_TOKEN */
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-radar-token");
  if (!process.env.RADAR_TOKEN || token !== process.env.RADAR_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const r = await rodarVarredura();
  return NextResponse.json({ ok: true, resultado: r ?? "já havia uma varredura rodando" });
}
