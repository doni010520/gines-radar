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

export interface Fonte {
  /** chave curta gravada em radar_anuncios.portal e prefixo do id ("zap") */
  portal: string;
  /** nome pra tela ("ZAP") */
  nome: string;
  /**
   * Página `pagina` (0, 1, 2...) de anúncios de venda do bairro. Lista vazia = acabou.
   * Se `ordenadoPorRecentes`, do mais novo pro mais antigo.
   */
  buscarPagina(b: BairroBusca, pagina: number): Promise<Anuncio[]>;
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
}
