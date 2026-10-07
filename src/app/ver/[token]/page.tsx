import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dataHora, preco } from "@/lib/ui/format";
import { FormSubmitButton } from "../../(admin)/FormSubmitButton";
import { Acao, AtualizaSozinho } from "./Controles";
import {
  adicionarPalavra,
  alternarBairro,
  descartar,
  pedirBusca,
  removerBairro,
  removerPalavra,
  salvarBairro,
  salvarNumero,
} from "./actions";

/**
 * Radar completo sem login, para aprovação: parâmetros, botão de busca e resultados.
 * Protegido pelo segredo no link (RADAR_SHARE_TOKEN); as ações conferem o mesmo segredo.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "GINES · Radar", robots: { index: false, follow: false } };

const CONTROL =
  "w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors " +
  "placeholder:text-ink-subtle hover:border-border-strong focus:bg-surface focus:border-primary";
const LABEL = "block text-xs font-semibold text-ink-muted";
const SECAO = "px-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase";

const TIPOS = [
  ["HOME", "Casa"],
  ["TWO_STORY_HOUSE", "Sobrado"],
  ["CONDOMINIUM", "Casa de condomínio"],
  ["RESIDENTIAL_ALLOTMENT_LAND", "Terreno"],
  ["APARTMENT", "Apartamento"],
  ["PENTHOUSE", "Cobertura"],
] as const;
const ROTULO_TIPO: Record<string, string> = Object.fromEntries(TIPOS);
const PADRAO = ["HOME", "TWO_STORY_HOUSE", "CONDOMINIUM", "RESIDENTIAL_ALLOTMENT_LAND", "APARTMENT"];

type BairroForm = { id: string; nome: string; zona: string; teto_m2: number | null; pct_abaixo_media: number; tipos: string[] };

function minutosDesde(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

function CamposBairro({ b }: { b?: BairroForm }) {
  const p = b?.id ?? "novo";
  return (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-1">
          <label htmlFor={`${p}-nome`} className={LABEL}>
            Bairro
          </label>
          <input id={`${p}-nome`} name="nome" required defaultValue={b?.nome} placeholder="Pinheiros" className={`min-h-11 ${CONTROL}`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-zona`} className={LABEL}>
            Zona
          </label>
          <input id={`${p}-zona`} name="zona" defaultValue={b?.zona ?? "Zona Oeste"} className={`min-h-11 ${CONTROL}`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-teto`} className={LABEL}>
            Teto R$/m² <span className="font-normal text-ink-subtle">(opcional)</span>
          </label>
          <input id={`${p}-teto`} name="teto_m2" inputMode="numeric" defaultValue={b?.teto_m2 ?? ""} placeholder="ex.: 5000" className={`tabular min-h-11 ${CONTROL}`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-pct`} className={LABEL}>
            Ou % abaixo da média
          </label>
          <input id={`${p}-pct`} name="pct_abaixo_media" inputMode="numeric" defaultValue={b?.pct_abaixo_media ?? 40} className={`tabular min-h-11 ${CONTROL}`} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TIPOS.map(([valor, rotulo]) => (
          <label
            key={valor}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink has-[:checked]:border-primary"
          >
            <input type="checkbox" name="tipos" value={valor} defaultChecked={(b?.tipos ?? PADRAO).includes(valor)} className="h-4 w-4 accent-[var(--color-primary)]" />
            {rotulo}
          </label>
        ))}
      </div>
    </>
  );
}

export default async function VerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.RADAR_SHARE_TOKEN || token !== process.env.RADAR_SHARE_TOKEN) notFound();

  const db = createServiceClient();
  const [{ data: cfg }, { data: bairros }, { data: palavras }, { data: lista }, { count: analisados }] = await Promise.all([
    db.from("radar_config").select("*").eq("id", true).maybeSingle(),
    db.from("radar_bairros").select("*").order("nome"),
    db.from("radar_palavras").select("*").order("termo"),
    db
      .from("radar_anuncios")
      .select("id,bairro_id,tipo,titulo,url,preco,area,preco_m2,pct_abaixo,motivo,anunciante,visto_em")
      .eq("oportunidade", true)
      .eq("descartado", false)
      .order("visto_em", { ascending: false })
      .limit(200),
    db.from("radar_anuncios").select("id", { count: "exact", head: true }),
  ]);
  const nome = new Map((bairros ?? []).map((b) => [b.id, b.nome]));

  const coletorMin = minutosDesde(cfg?.coletor_visto_em);
  const coletorOnline = coletorMin !== null && coletorMin <= 2;
  const status = cfg?.busca_status ?? "parada";
  const emAndamento = status === "aguardando" || status === "rodando";
  const resultado = (cfg?.busca_resultado ?? null) as { novos?: number; oportunidades?: number; erros?: string[]; erro?: string } | null;

  const textoStatus =
    status === "aguardando"
      ? coletorOnline
        ? "Pedido enviado — começando…"
        : "Pedido registrado, aguardando o coletor ficar online."
      : status === "rodando"
        ? `Buscando… (desde ${dataHora(cfg?.busca_iniciada_em)})`
        : status === "concluida"
          ? `Última busca concluída: ${resultado?.novos ?? 0} anúncios novos, ${resultado?.oportunidades ?? 0} oportunidades.`
          : status === "erro"
            ? `A última busca falhou: ${resultado?.erros?.[0] ?? resultado?.erro ?? "erro desconhecido"}`
            : "Nenhuma busca feita ainda.";

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <AtualizaSozinho ativo={emAndamento} />
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-ink">GINES · Radar de oportunidades</h1>
        <p className="text-sm text-ink-muted">
          {(lista ?? []).length} oportunidades entre {analisados ?? 0} anúncios analisados no ZAP.
        </p>
      </header>

      {/* ---- BUSCA ---- */}
      <section className="space-y-2">
        <h2 className={SECAO}>Buscar</h2>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Acao
              acao={pedirBusca.bind(null, token, null)}
              rotulo="🔎 Buscar agora (todos os bairros)"
              pendente="Enviando…"
              variant="primary"
              size="md"
              disabled={emAndamento}
            />
            {(bairros ?? [])
              .filter((b) => b.ativo)
              .map((b) => (
                <Acao key={b.id} acao={pedirBusca.bind(null, token, b.id)} rotulo={`Só ${b.nome}`} variant="secondary" disabled={emAndamento} />
              ))}
          </div>
          <p className={`text-sm ${status === "erro" ? "text-danger-ink" : "text-ink"}`}>{textoStatus}</p>
          <p className="text-xs text-ink-subtle">
            Coletor: {coletorOnline ? "🟢 online" : "🔴 offline"}
            {cfg?.coletor_host ? ` (${cfg.coletor_host})` : ""}
            {coletorMin !== null && !coletorOnline ? ` · último sinal há ${coletorMin} min` : ""}. A busca sai por uma máquina com internet
            residencial, porque os portais bloqueiam servidores. Ela leva cerca de 1 minuto por bairro; na 1ª vez de um bairro novo o radar
            só aprende o preço médio.
          </p>
        </Card>
      </section>

      {/* ---- RESULTADOS ---- */}
      <section className="space-y-2">
        <h2 className={SECAO}>Oportunidades</h2>
        {(lista ?? []).length === 0 && <Card className="p-4 text-sm text-ink-muted">Nenhuma oportunidade ainda.</Card>}
        <div className="space-y-3">
          {(lista ?? []).map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{a.bairro_id ? nome.get(a.bairro_id) ?? "—" : "—"}</Badge>
                    {a.tipo && <Badge tone="mute">{ROTULO_TIPO[a.tipo] ?? a.tipo}</Badge>}
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
                <Acao acao={descartar.bind(null, token, a.id)} rotulo="Descartar" />
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ---- PARÂMETROS ---- */}
      <section className="space-y-2">
        <h2 className={SECAO}>Parâmetros da busca · bairros</h2>
        <p className="px-1 text-xs text-ink-muted">
          Um anúncio vira oportunidade se o R$/m² ficar abaixo do teto do bairro (ou, sem teto, X% abaixo da média que o radar calcula) ou
          se o texto tiver alguma das palavras-chave.
        </p>
        {(bairros ?? []).map((b) => (
          <Card key={b.id} className={`p-4 ${b.ativo ? "" : "opacity-70"}`}>
            <form action={salvarBairro.bind(null, token)} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{b.nome}</span>
                <Badge tone={b.ativo ? "ok" : "mute"}>{b.ativo ? "Ativo" : "Pausado"}</Badge>
                {b.ultima_varredura && <span className="text-xs text-ink-subtle">última busca {dataHora(b.ultima_varredura)}</span>}
              </div>
              <CamposBairro
                b={{ id: b.id, nome: b.nome, zona: b.zona, teto_m2: b.teto_m2 === null ? null : Number(b.teto_m2), pct_abaixo_media: Number(b.pct_abaixo_media), tipos: b.tipos }}
              />
              <div className="flex flex-wrap gap-2">
                <FormSubmitButton pendingLabel="Salvando..." size="sm">
                  Salvar
                </FormSubmitButton>
                <Acao acao={alternarBairro.bind(null, token, b.id, !b.ativo)} rotulo={b.ativo ? "Pausar" : "Ativar"} variant="secondary" />
                <Acao acao={removerBairro.bind(null, token, b.id)} rotulo="Remover" variant="danger" confirmar={`Remover ${b.nome}?`} />
              </div>
            </form>
          </Card>
        ))}
        <Card className="p-4">
          <form action={salvarBairro.bind(null, token)} className="space-y-3">
            <p className="text-sm font-semibold text-ink">Adicionar bairro</p>
            <CamposBairro />
            <FormSubmitButton pendingLabel="Adicionando..." size="sm">
              Adicionar bairro
            </FormSubmitButton>
          </form>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className={SECAO}>Parâmetros da busca · palavras-chave</h2>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(palavras ?? []).map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted py-1 pr-1 pl-3 text-sm text-ink">
                {p.termo}
                <Acao acao={removerPalavra.bind(null, token, p.id)} rotulo="×" />
              </span>
            ))}
          </div>
          <form action={adicionarPalavra.bind(null, token)} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <label htmlFor="termo" className={LABEL}>
                Nova palavra ou expressão (acento e maiúscula não importam)
              </label>
              <input id="termo" name="termo" required placeholder="ex.: espólio" className={`min-h-11 ${CONTROL}`} />
            </div>
            <FormSubmitButton pendingLabel="..." size="sm">
              Adicionar
            </FormSubmitButton>
          </form>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className={SECAO}>Alertas no WhatsApp</h2>
        <Card className="p-4">
          <form action={salvarNumero.bind(null, token)} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <label htmlFor="alerta_numero" className={LABEL}>
                Número que recebe cada oportunidade nova (vazio = só aparece aqui)
              </label>
              <input id="alerta_numero" name="alerta_numero" defaultValue={cfg?.alerta_numero ?? ""} placeholder="5511999999999" className={`tabular min-h-11 ${CONTROL}`} />
            </div>
            <FormSubmitButton pendingLabel="..." size="sm">
              Salvar
            </FormSubmitButton>
          </form>
        </Card>
      </section>
    </div>
  );
}
