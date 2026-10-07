import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dataHora, preco } from "@/lib/ui/format";
import { FormSubmitButton } from "../../(admin)/FormSubmitButton";
import { Acao, AtualizaSozinho } from "./Controles";
import { SelecaoBairros } from "./SelecaoBairros";
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
 * Radar sem login (aprovação). Três abas: Oportunidades (buscar + resultados), Critérios
 * (bairros/preço/tipos/palavras) e Alertas. Protegido pelo segredo no link (RADAR_SHARE_TOKEN).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "GINES · Radar", robots: { index: false, follow: false } };

const CONTROL =
  "w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors " +
  "placeholder:text-ink-subtle hover:border-border-strong focus:bg-surface focus:border-primary";
const LABEL = "block text-xs font-semibold text-ink-muted";

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

type Aba = "oportunidades" | "criterios" | "alertas";
type BairroForm = { id: string; nome: string; zona: string; teto_m2: number | null; pct_abaixo_media: number; tipos: string[] };

function minutosDesde(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
}

const criterioPreco = (b: { teto_m2: number | string | null; pct_abaixo_media: number | string }) =>
  b.teto_m2 ? `R$/m² até ${Number(b.teto_m2).toLocaleString("pt-BR")}` : `${Number(b.pct_abaixo_media)}% abaixo da média`;

function CamposBairro({ b }: { b?: BairroForm }) {
  const p = b?.id ?? "novo";
  return (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <label htmlFor={`${p}-nome`} className={LABEL}>
            Bairro (como no ZAP)
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
            Teto R$/m²
          </label>
          <input id={`${p}-teto`} name="teto_m2" inputMode="numeric" defaultValue={b?.teto_m2 ?? ""} placeholder="vazio = usa %" className={`tabular min-h-11 ${CONTROL}`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-pct`} className={LABEL}>
            % abaixo da média
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

export default async function VerPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ aba?: string; b?: string }>;
}) {
  const { token } = await params;
  if (!process.env.RADAR_SHARE_TOKEN || token !== process.env.RADAR_SHARE_TOKEN) notFound();
  const sp = await searchParams;
  const aba: Aba = sp.aba === "criterios" || sp.aba === "alertas" ? sp.aba : "oportunidades";
  const filtroBairro = sp.b || "";

  const db = createServiceClient();
  let qLista = db
    .from("radar_anuncios")
    .select("id,bairro_id,tipo,titulo,url,preco,area,preco_m2,pct_abaixo,motivo,anunciante,visto_em")
    .eq("oportunidade", true)
    .eq("descartado", false)
    .order("visto_em", { ascending: false })
    .limit(200);
  if (filtroBairro) qLista = qLista.eq("bairro_id", filtroBairro);

  const [{ data: cfg }, { data: bairros }, { data: palavras }, { data: lista }] = await Promise.all([
    db.from("radar_config").select("*").eq("id", true).maybeSingle(),
    db.from("radar_bairros").select("*").order("nome"),
    db.from("radar_palavras").select("*").order("termo"),
    qLista,
  ]);
  const nome = new Map((bairros ?? []).map((b) => [b.id, b.nome]));
  const ativos = (bairros ?? []).filter((b) => b.ativo);

  const coletorMin = minutosDesde(cfg?.coletor_visto_em);
  const coletorOnline = coletorMin !== null && coletorMin <= 2;
  const status = cfg?.busca_status ?? "parada";
  const emAndamento = status === "aguardando" || status === "rodando";
  const resultado = (cfg?.busca_resultado ?? null) as { novos?: number; oportunidades?: number; erros?: string[]; erro?: string } | null;
  const textoStatus =
    status === "aguardando"
      ? coletorOnline
        ? "Busca pedida — começando…"
        : "Busca pedida, aguardando o coletor ficar online."
      : status === "rodando"
        ? "Buscando… a lista atualiza sozinha."
        : status === "concluida"
          ? `Última busca (${dataHora(cfg?.busca_iniciada_em)}): ${resultado?.novos ?? 0} anúncios novos analisados, ${resultado?.oportunidades ?? 0} oportunidades novas.`
          : status === "erro"
            ? `A última busca falhou: ${resultado?.erros?.[0] ?? resultado?.erro ?? "erro desconhecido"}`
            : "";

  const base = `/ver/${token}`;
  const abaLink = (a: Aba, rotulo: string) => (
    <Link
      href={a === "oportunidades" ? base : `${base}?aba=${a}`}
      className={`border-b-2 px-1 pb-2 text-sm font-semibold outline-none transition-colors focus-visible:text-primary ${aba === a ? "border-primary text-primary" : "border-transparent text-ink-muted hover:text-ink"}`}
    >
      {rotulo}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
      <AtualizaSozinho ativo={emAndamento} />
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">GINES · Radar de oportunidades</h1>
          <p className="text-xs text-ink-subtle">Busca no ZAP · coletor {coletorOnline ? "🟢 online" : "🔴 offline"}</p>
        </div>
        <nav className="flex gap-6 border-b border-border">
          {abaLink("oportunidades", "Oportunidades")}
          {abaLink("criterios", `Critérios (${ativos.length} bairros)`)}
          {abaLink("alertas", "Alertas")}
        </nav>
      </header>

      {aba === "oportunidades" && (
        <>
          <Card className="space-y-3 p-4">
            {ativos.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Nenhum bairro ativo. Cadastre em{" "}
                <Link href={`${base}?aba=criterios`} className="text-primary underline">
                  Critérios
                </Link>
                .
              </p>
            ) : (
              <form action={pedirBusca.bind(null, token)} className="space-y-2">
                <div className="flex flex-wrap items-start gap-2">
                  <SelecaoBairros bairros={ativos.map((b) => ({ id: b.id, nome: b.nome, zona: b.zona }))} />
                  <FormSubmitButton pendingLabel="Enviando…">{emAndamento ? "Buscando…" : "🔎 Buscar"}</FormSubmitButton>
                </div>
                <Link href={`${base}?aba=criterios`} className="text-xs text-primary hover:underline">
                  critérios de preço e tipo de cada bairro
                </Link>
              </form>
            )}
            {textoStatus && <p className={`text-sm ${status === "erro" ? "text-danger-ink" : "text-ink-muted"}`}>{textoStatus}</p>}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{(lista ?? []).length} oportunidades</p>
            <form className="flex items-center gap-2" action={base}>
              <select name="b" defaultValue={filtroBairro} aria-label="Filtrar por bairro" className={`min-h-10 w-auto ${CONTROL}`}>
                <option value="">Todos os bairros</option>
                {(bairros ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-sm text-primary hover:underline">
                filtrar
              </button>
            </form>
          </div>

          <div className="space-y-3">
            {(lista ?? []).length === 0 && <Card className="p-4 text-sm text-ink-muted">Nenhuma oportunidade.</Card>}
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
        </>
      )}

      {aba === "criterios" && (
        <>
          <p className="text-sm text-ink-muted">
            Um anúncio vira oportunidade se o R$/m² ficar abaixo do teto do bairro (ou, sem teto, X% abaixo da média que o radar calcula) ou
            se o texto tiver alguma palavra-chave.
          </p>
          <Card className="divide-y divide-border">
            {(bairros ?? []).length === 0 && <p className="p-4 text-sm text-ink-muted">Nenhum bairro cadastrado.</p>}
            {(bairros ?? []).map((b) => (
              <details key={b.id} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-muted">
                  <span className={`min-w-32 font-semibold ${b.ativo ? "text-ink" : "text-ink-subtle line-through"}`}>{b.nome}</span>
                  <span className="text-sm text-ink">{criterioPreco(b)}</span>
                  <span className="text-xs text-ink-muted">{b.tipos.map((t) => ROTULO_TIPO[t] ?? t).join(", ")}</span>
                  <span className="ml-auto text-xs text-primary group-open:hidden">editar</span>
                  <span className="ml-auto hidden text-xs text-ink-muted group-open:inline">fechar</span>
                </summary>
                <form action={salvarBairro.bind(null, token)} className="space-y-3 border-t border-border bg-surface-muted/40 p-4">
                  <CamposBairro
                    b={{
                      id: b.id,
                      nome: b.nome,
                      zona: b.zona,
                      teto_m2: b.teto_m2 === null ? null : Number(b.teto_m2),
                      pct_abaixo_media: Number(b.pct_abaixo_media),
                      tipos: b.tipos,
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <FormSubmitButton pendingLabel="Salvando..." size="sm">
                      Salvar
                    </FormSubmitButton>
                    <Acao acao={alternarBairro.bind(null, token, b.id, !b.ativo)} rotulo={b.ativo ? "Pausar" : "Ativar"} variant="secondary" />
                    <Acao acao={removerBairro.bind(null, token, b.id)} rotulo="Remover" variant="danger" confirmar={`Remover ${b.nome}?`} />
                  </div>
                </form>
              </details>
            ))}
            <details>
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-muted">+ Adicionar bairro</summary>
              <form action={salvarBairro.bind(null, token)} className="space-y-3 border-t border-border p-4">
                <CamposBairro />
                <FormSubmitButton pendingLabel="Adicionando..." size="sm">
                  Adicionar
                </FormSubmitButton>
              </form>
            </details>
          </Card>

          <h2 className="pt-2 text-sm font-semibold text-ink">Palavras-chave no texto do anúncio</h2>
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
              <div className="min-w-48 flex-1">
                <input name="termo" required placeholder="nova palavra ou expressão (ex.: espólio)" aria-label="Nova palavra" className={`min-h-11 ${CONTROL}`} />
              </div>
              <FormSubmitButton pendingLabel="..." size="sm">
                Adicionar
              </FormSubmitButton>
            </form>
          </Card>
        </>
      )}

      {aba === "alertas" && (
        <Card className="p-4">
          <form action={salvarNumero.bind(null, token)} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <label htmlFor="alerta_numero" className={LABEL}>
                WhatsApp que recebe cada oportunidade nova (vazio = só aparece aqui)
              </label>
              <input id="alerta_numero" name="alerta_numero" defaultValue={cfg?.alerta_numero ?? ""} placeholder="5511999999999" className={`tabular min-h-11 ${CONTROL}`} />
            </div>
            <FormSubmitButton pendingLabel="..." size="sm">
              Salvar
            </FormSubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}
