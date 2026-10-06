import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { dataHora } from "@/lib/ui/format";
import { FormSubmitButton } from "../FormSubmitButton";
import { salvarConfig } from "../actions";

const CONTROL =
  "w-full rounded-lg border border-border bg-surface-muted px-3 text-sm text-ink transition-colors " +
  "placeholder:text-ink-subtle hover:border-border-strong focus:bg-surface focus:border-primary";
const LABEL = "block text-xs font-semibold text-ink-muted";

export default async function ConfigPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: config }, { data: logs }] = await Promise.all([
    supabase.from("radar_config").select("*").eq("id", true).maybeSingle(),
    supabase.from("radar_logs").select("*").order("id", { ascending: false }).limit(15),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title="Configuração" hint="Frequência da varredura e para onde vão os alertas." />
      <Card className="p-4">
        <form action={salvarConfig} className="space-y-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="ativo" defaultChecked={config?.ativo ?? true} className="h-4 w-4 accent-[var(--color-primary)]" />
            Radar ligado
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="intervalo_min" className={LABEL}>
                Varrer a cada (minutos)
              </label>
              <input
                id="intervalo_min"
                name="intervalo_min"
                inputMode="numeric"
                defaultValue={config?.intervalo_min ?? 30}
                className={`tabular min-h-11 ${CONTROL}`}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="alerta_numero" className={LABEL}>
                WhatsApp que recebe os alertas <span className="font-normal text-ink-subtle">(vazio = só aparece no painel)</span>
              </label>
              <input
                id="alerta_numero"
                name="alerta_numero"
                defaultValue={config?.alerta_numero ?? ""}
                placeholder="5511999999999"
                className={`tabular min-h-11 ${CONTROL}`}
              />
            </div>
          </div>
          <FormSubmitButton pendingLabel="Salvando..." size="sm">
            Salvar
          </FormSubmitButton>
        </form>
      </Card>

      <section className="space-y-2">
        <h2 className="px-1 text-[10px] font-extrabold tracking-[0.09em] text-primary uppercase">Últimos eventos</h2>
        <Card className="divide-y divide-border">
          {(logs ?? []).length === 0 && <p className="p-4 text-sm text-ink-muted">Nada registrado ainda.</p>}
          {(logs ?? []).map((l) => (
            <div key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="tabular text-xs text-ink-subtle">{dataHora(l.created_at)}</span>
              <span className={l.level === "error" ? "text-danger-ink" : "text-ink"}>{l.message}</span>
              {l.meta !== null && <span className="truncate text-xs text-ink-subtle">{JSON.stringify(l.meta)}</span>}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
