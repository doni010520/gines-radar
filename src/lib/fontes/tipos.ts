/**
 * Contrato de uma fonte (portal) do radar. Cada portal traduz o seu formato para Anuncio; a
 * varredura (src/lib/varredura.ts) não sabe nada de portal específico.
 */

export type BairroBusca = { nome: string; zona: string; cidade: string; estado: string };

/**
 * Tipos de imóvel no vocabulário do radar (o mesmo do ZAP, que veio primeiro). Cada fonte
 * converte o tipo dela para um destes; o que não se encaixa vira null e é ignorado.
 */
export type TipoImovel =
  | "HOME"
  | "TWO_STORY_HOUSE"
  | "CONDOMINIUM"
  | "VILLAGE_HOUSE"
  | "RESIDENTIAL_ALLOTMENT_LAND"
  | "APARTMENT"
  | "PENTHOUSE";

export type Anuncio = {
  id: string; // "<portal>:<id no portal>" — único no banco
  tipo: string | null;
  titulo: string;
  url: string;
  preco: number | null;
  area: number | null; // m² útil/privativo; terreno: área do terreno
  anunciante: string | null;
  criadoNoPortal: string | null; // ISO, se o portal informar
};

/**
 * Recorte de uma busca dentro do portal (ex.: só casas). Sem isso o radar lê os anúncios mais
 * novos de todos os tipos e descarta o que não interessa — num bairro de prédio, as casas quase
 * não aparecem (Moema: 111 casas no ZAP, o radar via 7 — 23/10/26).
 */
export type Variante = { chave: string; tipos: string[] };

export interface Fonte {
  /** chave curta gravada em radar_anuncios.portal e prefixo do id ("zap") */
  portal: string;
  /** nome pra tela ("ZAP") */
  nome: string;
  /**
   * Página `pagina` (0, 1, 2...) de anúncios de venda do bairro. Lista vazia = acabou.
   * Se `ordenadoPorRecentes`, do mais novo pro mais antigo.
   */
  buscarPagina(b: BairroBusca, pagina: number, variante?: Variante): Promise<Anuncio[]>;
  /**
   * Opcional: recortes da busca pros tipos marcados no bairro, quando o portal filtra tipo no
   * servidor. Cada variante é lida e aprende a média separadamente (ver Variante).
   */
  variantes?(tiposDoBairro: string[]): Variante[];
  /** Descrição completa do anúncio (onde aparecem "precisa de reforma", "inventário"...). */
  buscarDescricao(url: string): Promise<string>;
  /**
   * true = a busca incremental para na 1ª página que já tem anúncio conhecido.
   * false = o portal não ordena por data; lê sempre `paginasNovos` páginas.
   */
  ordenadoPorRecentes: boolean;
  /** 1ª busca do bairro nesse portal: quantas páginas ler pra formar a média */
  paginasAprendizado: number;
  /** buscas seguintes: máximo de páginas pra achar o que é novo */
  paginasNovos: number;
  /** pausa entre requisições ao portal (padrão 1,5 s); respeita o Crawl-delay do robots.txt */
  pausaMs?: number;
  /** descrições abertas ao mesmo tempo (padrão 4); 1 = uma por vez */
  descricoesEmParalelo?: number;
}
