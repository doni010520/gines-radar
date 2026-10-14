-- Feedback do Gines (13/10/26): interessa ~1% dos anúncios, com desconto real — corte padrão
-- passa de 40% para 50% abaixo da média. Cidade/estado passam a ser escolhidos na tela (busca
-- nacional); zona fica opcional (o ZAP filtra só por cidade + estado + bairro).
alter table radar_bairros alter column pct_abaixo_media set default 50;
update radar_bairros set pct_abaixo_media = 50 where pct_abaixo_media = 40;
