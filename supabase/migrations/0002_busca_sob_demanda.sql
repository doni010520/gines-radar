-- Busca sob demanda: o botão "Buscar agora" grava o pedido; quem executa é o servidor
-- (se houver proxy residencial configurado) ou o coletor local, que fica esperando pedidos.
alter table radar_config
  add column if not exists busca_solicitada_em timestamptz,
  add column if not exists busca_bairro_id uuid,
  add column if not exists busca_status text not null default 'parada', -- parada | aguardando | rodando | concluida | erro
  add column if not exists busca_iniciada_em timestamptz,
  add column if not exists busca_resultado jsonb;
