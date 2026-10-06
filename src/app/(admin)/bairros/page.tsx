import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dataHora } from "@/lib/ui/format";
import { FormSubmitButton } from "../FormSubmitButton";
import { AcaoButton } from "../AcaoButton";
import { adicionarPalavra, alternarBairro, removerBairro, removerPalavra, salvarBairro } from "../actions";

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
const PADRAO = ["HOME", "TWO_STORY_HOUSE", "CONDOMINIUM", "RESIDENTIAL_ALLOTMENT_LAND", "APARTMENT"];

type Bairro = {
  id: string;
  nome: string;
  zona: string;
  teto_m2: number | null;
  pct_abaixo_media: number;
  tipos: string[];
};

function CamposBairro({ b }: { b?: Bairro }) {
  const p = b?.id ?? "novo";
  return (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`${p}-nome`} className={LABEL}>
            Bairro (como aparece no ZAP)
          </label>
          <input id={`${p}-nome`} name="nome" required defaultValue={b?.nome} placeholder="Pinheiros" className={`min-h-11 ${CONTROL}`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-zona`} className={LABEL}>
            Zona
          </label>
          <input id={`${p}-zona`} name="zona" defaultValue={b?.zona ?? "Zona Oeste"} placeholder="Zona Oeste" className={`min-h-11 ${CONTROL}`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-teto`} className={LABEL}>
            Teto R$/m² <span className="font-normal text-ink-subtle">(opcional)</span>
          </label>
          <input
            id={`${p}-teto`}
            name="teto_m2"
            inputMode="numeric"
            defaultValue={b?.teto_m2 ?? ""}
            placeholder="ex.: 5000"
            className={`tabular min-h-11 ${CONTROL}`}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${p}-pct`} className={LABEL}>
            Ou % abaixo da média <span className="font-normal text-ink-subtle">(vale quando não há teto)</span>
          </label>
          <input
            id={`${p}-pct`}
            name="pct_abaixo_media"
            inputMode="numeric"
            defaultValue={b?.pct_abaixo_media ?? 40}
            className={`tabular min-h-11 ${CONTROL}`}
          />
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className={LABEL}>Tipos de imóvel</legend>
        <div className="flex flex-wrap gap-2 pt-1">
          {TIPOS.map(([valor, rotulo]) => (
            <label
              key={valor}
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink has-[:checked]:border-primary"
            >
              <input
                type="checkbox"
                name="tipos"
                value={valor}
                defaultChecked={(b?.tipos ?? PADRAO).includes(valor)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              {rotulo}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export default async function BairrosPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: bairros }, { data: palavras }] = await Promise.all([
    supabase.from("radar_bairros").select("*").order("nome"),
    supabase.from("radar_palavras").select("*").order("categoria").order("termo"),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bairros e filtros"
        hint="Um anúncio vira oportunidade se o R$/m² estiver abaixo do teto (ou X% abaixo da média do bairro) ou se o texto tiver alguma das palavras-chave."
      />

      <section className="space-y-2">
        <h2 className={SECAO}>Bairros monitorados</h2>
        {(bairros ?? []).length === 0 && <Card className="p-4 text-sm text-ink-muted">Nenhum bairro ainda — cadastre abaixo.</Card>}
        {(bairros ?? []).map((b) => (
          <Card key={b.id} className={`p-4 ${b.ativo ? "" : "opacity-70"}`}>
            <form action={salvarBairro} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{b.nome}</span>
                <Badge tone={b.ativo ? "ok" : "mute"}>{b.ativo ? "Ativo" : "Pausado"}</Badge>
                <Badge tone={b.aprendido_em ? "info" : "warn"}>
                  {b.aprendido_em ? "Média aprendida" : "Aprendendo na 1ª varredura"}
                </Badge>
                {b.ultima_varredura && <span className="text-xs text-ink-subtle">última varredura {dataHora(b.ultima_varredura)}</span>}
              </div>
              <CamposBairro b={{ ...b, teto_m2: b.teto_m2 === null ? null : Number(b.teto_m2), pct_abaixo_media: Number(b.pct_abaixo_media) }} />
              <div className="flex flex-wrap gap-2">
                <FormSubmitButton pendingLabel="Salvando..." size="sm">
                  Salvar
                </FormSubmitButton>
                <AcaoButton
                  acao={alternarBairro.bind(null, b.id, !b.ativo)}
                  rotulo={b.ativo ? "Pausar" : "Ativar"}
                  pendente="..."
                  variant="secondary"
                />
                <AcaoButton
                  acao={removerBairro.bind(null, b.id)}
                  rotulo="Remover"
                  pendente="Removendo..."
                  variant="danger"
                  confirmar={`Remover ${b.nome}? Os anúncios já vistos continuam guardados.`}
                />
              </div>
            </form>
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className={SECAO}>Novo bairro</h2>
        <Card className="p-4">
          <form action={salvarBairro} className="space-y-3">
            <CamposBairro />
            <FormSubmitButton pendingLabel="Adicionando..." size="sm">
              Adicionar bairro
            </FormSubmitButton>
          </form>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className={SECAO}>Palavras-chave no anúncio</h2>
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {(palavras ?? []).map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted py-1 pr-1 pl-3 text-sm text-ink"
              >
                {p.termo}
                <AcaoButton acao={removerPalavra.bind(null, p.id)} rotulo="×" pendente="…" />
              </span>
            ))}
          </div>
          <form action={adicionarPalavra} className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1 space-y-1.5">
              <label htmlFor="termo" className={LABEL}>
                Nova palavra ou expressão
              </label>
              <input id="termo" name="termo" required placeholder="ex.: espólio" className={`min-h-11 ${CONTROL}`} />
            </div>
            <FormSubmitButton pendingLabel="..." size="sm">
              Adicionar
            </FormSubmitButton>
          </form>
          <p className="text-xs text-ink-subtle">Acento e maiúscula não importam: “inventário” também pega “Inventario”.</p>
        </Card>
      </section>
    </div>
  );
}
