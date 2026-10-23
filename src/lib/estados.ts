/** Estados como o portal espera no filtro (nome por extenso) e a sigla pra exibir. */
export const ESTADOS: [string, string][] = [
  ["Acre", "AC"], ["Alagoas", "AL"], ["Amapá", "AP"], ["Amazonas", "AM"], ["Bahia", "BA"],
  ["Ceará", "CE"], ["Distrito Federal", "DF"], ["Espírito Santo", "ES"], ["Goiás", "GO"],
  ["Maranhão", "MA"], ["Mato Grosso", "MT"], ["Mato Grosso do Sul", "MS"], ["Minas Gerais", "MG"],
  ["Pará", "PA"], ["Paraíba", "PB"], ["Paraná", "PR"], ["Pernambuco", "PE"], ["Piauí", "PI"],
  ["Rio de Janeiro", "RJ"], ["Rio Grande do Norte", "RN"], ["Rio Grande do Sul", "RS"],
  ["Rondônia", "RO"], ["Roraima", "RR"], ["Santa Catarina", "SC"], ["São Paulo", "SP"],
  ["Sergipe", "SE"], ["Tocantins", "TO"],
];

export function siglaUf(estado: string): string {
  return ESTADOS.find(([n]) => n === estado)?.[1] ?? estado;
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);

/**
 * "moema" → "Moema", "vila madalena" → "Vila Madalena", "JARDIM DAS ACÁCIAS" → "Jardim das Acácias".
 * O ZAP diferencia maiúscula de minúscula no filtro de bairro ("moema" dava 0 anúncios, "Moema"
 * dava 30 — 22/10/26). Nome digitado já com maiúscula e minúscula misturadas é mantido.
 */
export function nomeProprio(texto: string): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (limpo !== limpo.toLowerCase() && limpo !== limpo.toUpperCase()) return limpo;
  return limpo
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}
