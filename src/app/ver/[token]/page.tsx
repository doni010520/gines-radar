import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dataHora, preco } from "@/lib/ui/format";

/**
 * Visualização sem login, só leitura, para compartilhar com quem não tem conta.
 * Protegida pelo segredo no próprio link (env RADAR_SHARE_TOKEN). Nada aqui altera dado.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const TIPO: Record<string, string> = {
  HOME: "Casa",
  TWO_STORY_HOUSE: "Sobrado",
  CONDOMINIUM: "Casa de condomínio",
  RESIDENTIAL_ALLOTMENT_LAND: "Terreno",
  APARTMENT: "Apartamento",
  PENTHOUSE: "Cobertura",
};

export default async function VerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.RADAR_SHARE_TOKEN || token !== process.env.RADAR_SHARE_TOKEN) notFound();

  const db = createServiceClient();
  const [{ data: lista }, { data: bairros }, { count: analisados }] = await Promise.all([
    db
      .from("radar_anuncios")
      .select("id,bairro_id,tipo,titulo,url,preco,area,preco_m2,pct_abaixo,motivo,anunciante,visto_em")
      .eq("oportunidade", true)
      .eq("descartado", false)
      .order("pct_abaixo", { ascending: false, nullsFirst: false })
      .limit(200),
    db.from("radar_bairros").select("id,nome,teto_m2,pct_abaixo_media,ativo"),
    db.from("radar_anuncios").select("id", { count: "exact", head: true }),
  ]);
  const nome = new Map((bairros ?? []).map((b) => [b.id, b.nome]));

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-6">
      <PageHeader
        title="GINES · Radar de oportunidades"
        hint={`${(lista ?? []).length} oportunidades entre ${analisados ?? 0} anúncios analisados · bairros: ${(bairros ?? [])
          .filter((b) => b.ativo)
          .map((b) => `${b.nome} (${b.teto_m2 ? `teto R$ ${Number(b.teto_m2).toLocaleString("pt-BR")}/m²` : `${Number(b.pct_abaixo_media)}% abaixo da média`})`)
          .join(", ")}`}
      />
      <div className="space-y-3">
        {(lista ?? []).map((a) => (
          <Card key={a.id} className="p-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{a.bairro_id ? nome.get(a.bairro_id) ?? "—" : "—"}</Badge>
                {a.tipo && <Badge tone="mute">{TIPO[a.tipo] ?? a.tipo}</Badge>}
                {a.pct_abaixo !== null && Number(a.pct_abaixo) > 0 && <Badge tone="ok">{Number(a.pct_abaixo)}% abaixo da média</Badge>}
              </div>
              <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="block font-semibold text-ink hover:text-primary">
                {a.titulo || "Anúncio sem título"}
              </a>
              <p className="tabular text-sm text-ink">
                {preco(a.preco ? Number(a.preco) : null)}
                {a.area ? ` · ${Number(a.area)} m²` : ""}
                {a.preco_m2 ? ` · R$ ${Number(a.preco_m2).toLocaleString("pt-BR")}/m²` : ""}
              </p>
              {a.motivo && <p className="text-xs text-ink-muted">{a.motivo}</p>}
              <p className="text-[11px] text-ink-subtle">
                {a.anunciante ? `${a.anunciante} · ` : ""}visto {dataHora(a.visto_em)}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
