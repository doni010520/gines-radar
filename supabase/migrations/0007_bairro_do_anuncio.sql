-- Bairro de cada anúncio como o portal escreve: no modo "cidade inteira" a média é por bairro
-- (Gines, 04/11/26 — comparar com a média da cidade toda punha bairro caro contra bairro barato)
alter table radar_anuncios add column if not exists bairro_nome text;

-- bairro com nome que não bate com os portais (nenhum anúncio): nomes parecidos achados na cidade.
-- null = bairro ok
alter table radar_bairros add column if not exists sugestoes text[];
