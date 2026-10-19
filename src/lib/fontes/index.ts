/**
 * Fontes ativas do radar, na ordem em que a busca percorre (prioridade do Gines, 14/10/26).
 * Portal novo: criar o arquivo implementando Fonte (./tipos.ts) e incluir aqui.
 *
 * Fora da lista de propósito:
 * - VivaReal: mesmo banco de anúncios do ZAP (mesmos ids e totais) — já coberto.
 * - Wimóveis: mesmo banco do Imovelweb (58 de 59 ids iguais na Asa Sul) — já coberto.
 * - Mercado Livre: ainda em construção (navegador de verdade). Facebook: exige login numa conta.
 * - Caixa / leilões / bancos: critério de exclusão do Gines.
 */
import type { Fonte } from "./tipos";
import { zap } from "./zap";
import { olx } from "./olx";
import { proprietariodireto } from "./proprietariodireto";
import { casamineira, imovelweb } from "./navent";
import { chavesnamao } from "./chavesnamao";
import { quintoandar } from "./quintoandar";
import { spimovel } from "./spimovel";
import { loft } from "./loft";

export const FONTES: Fonte[] = [olx, zap, proprietariodireto, imovelweb, chavesnamao, quintoandar, spimovel, loft, casamineira];

export function fontePorPortal(portal: string): Fonte | undefined {
  return FONTES.find((f) => f.portal === portal);
}

/** Nome do portal pra tela, inclusive de fonte que já saiu da lista. */
export function nomeDoPortal(portal: string | null | undefined): string {
  if (!portal) return "—";
  return fontePorPortal(portal)?.nome ?? portal;
}

export type { Anuncio, BairroBusca, Fonte } from "./tipos";
