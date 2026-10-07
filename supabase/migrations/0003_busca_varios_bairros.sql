-- Busca por seleção de bairros (lista), em vez de "todos" ou "um".
alter table radar_config add column if not exists busca_bairros uuid[];
