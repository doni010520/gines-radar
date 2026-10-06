import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dataHora, preco } from "@/lib/ui/format";
import { AcaoButton } from "../AcaoButton";
import { descartarAnuncio } from "../actions";

const TIPO: Record<string, string> = {
  HOME: "Casa",
  TWO_STORY_HOUSE: "Sobrado",
  CONDOMINIUM: "Casa de condomínio",
  RESIDENTIAL_ALLOTMENT_LAND: "Terreno",
  APARTMENT: "Apartamento",
  PENTHOUSE: "Cobertura",
};

/** Fora do componente: o lint do React não aceita Date.now() durante o render. */
function haVinteQuatroHoras() {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}

export default async function OportunidadesPage() {
  const supabase = await createSupabaseServerClient();
  const desde24h = haVinteQuatroHoras();
  const [{ data: lista }, { data: bairros }, { count: vistos24h }] = await Promise.all([
    supabase
      .from("radar_anuncios")
      .select("*")
      .eq("oportunidade", true)
      .eq("descartado", false)
      .order("visto_em", { ascending: false })
      .limit(100),
    supabase.from("radar_bairros").select("id,nome,ativo,aprendido_em,ultima_varredura"),
    supabase.from("radar_anuncios").select("id", { count: "exact", head: true }).gte("visto_em", desde24h),
  ]);
  const nomeBairro = new Map((bairros ?? []).map((b) => [b.id, b.nome]));
  const ativos = (bairros ?? []).filter((b) => b.ativo);
  const ultima = (bairros ?? []).map((b) => b.ultima_varredura).filter(Boolean).sort().at(-1);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Oportunidades"
        hint={`${ativos.length} ${ativos.length === 1 ? "bairro monitorado" : "bairros monitorados"} · ${vistos24h ?? 0} anúncios analisados nas últimas 24h · última varredura: ${ultima ? dataHora(ultima) : "ainda não rodou"}`}
      />

      {(lista ?? []).length === 0 && (
        <Card className="p-6 text-sm text-ink-muted">
          Nenhuma oportunidade ainda. Na 1ª varredura de cada bairro o radar só aprende o preço médio — os alertas
          começam a partir da 2ª.
        </Card>
      )}

      <div className="space-y-3">
        {(lista ?? []).map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">{a.bairro_id ? nomeBairro.get(a.bairro_id) ?? "—" : "—"}</Badge>
                  {a.tipo && <Badge tone="mute">{TIPO[a.tipo] ?? a.tipo}</Badge>}
                  {a.pct_abaixo !== null && Number(a.pct_abaixo) > 0 && (
                    <Badge tone="ok">{Number(a.pct_abaixo)}% abaixo da média</Badge>
                  )}
                  {a.alertado_em && <Badge tone="mute">alertado</Badge>}
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
              <AcaoButton acao={descartarAnuncio.bind(null, a.id)} rotulo="Descartar" pendente="..." />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
