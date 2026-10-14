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
