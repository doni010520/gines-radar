-- Cada portal pode buscar em recortes ("variantes") — o ZAP só filtra tipo de imóvel um por vez,
-- então casas, apartamentos, terrenos... viram consultas separadas (23/10/26: Moema tinha 111
-- casas no ZAP e o radar só via 7, porque lia os 300 anúncios mais novos de todos os tipos).
-- Cada variante aprende a média uma vez: "<portal>:<variante>" entra aqui depois da 1ª leitura.
alter table radar_bairros add column if not exists aprendido_variantes text[] not null default '{}';

-- o que já foi aprendido até hoje (portal inteiro, sem recorte) não precisa reaprender
update radar_bairros b
   set aprendido_variantes = coalesce((
     select array_agg(distinct a.portal || ':*') from radar_anuncios a where a.bairro_id = b.id
   ), '{}');
