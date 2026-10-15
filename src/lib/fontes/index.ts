/**
 * Fontes ativas do radar, na ordem em que a busca percorre. Portal novo: criar o arquivo
 * implementando Fonte (./tipos.ts) e incluir aqui.
 */
import type { Fonte } from "./tipos";
import { zap } from "./zap";

export const FONTES: Fonte[] = [zap];

export function fontePorPortal(portal: string): Fonte | undefined {
  return FONTES.find((f) => f.portal === portal);
}

/** Nome do portal pra tela, inclusive de fonte que já saiu da lista. */
export function nomeDoPortal(portal: string | null | undefined): string {
  if (!portal) return "—";
  return fontePorPortal(portal)?.nome ?? portal;
}

export type { Anuncio, BairroBusca, Fonte } from "./tipos";
