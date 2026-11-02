/** Bairro sem nome = cidade inteira (pedido do Gines, 02/11/26: útil em cidade pequena). */
export const nomeBairro = (b: { nome: string; cidade: string }) => b.nome || `${b.cidade} (cidade inteira)`;
