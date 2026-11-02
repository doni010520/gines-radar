-- Pedidos do Gines (26/10 e 02/11/26):
-- 1) faixa de valor por bairro: só é oportunidade o que estiver abaixo da média E dentro da faixa
alter table radar_bairros add column if not exists preco_min numeric;
alter table radar_bairros add column if not exists preco_max numeric;

-- 2) alerta pra vários números de WhatsApp (antes era um só)
alter table radar_config add column if not exists alerta_numeros text[] not null default '{}';
update radar_config
   set alerta_numeros = array[
         case when length(regexp_replace(alerta_numero, '\D', '', 'g')) in (10, 11)
              then '55' || regexp_replace(alerta_numero, '\D', '', 'g')
              else regexp_replace(alerta_numero, '\D', '', 'g') end]
 where coalesce(alerta_numero, '') <> '' and alerta_numeros = '{}';

-- 3) sentinela: busca automática 1x por dia, no horário escolhido (hora de Brasília)
alter table radar_config add column if not exists sentinela_ativa boolean not null default false;
alter table radar_config add column if not exists sentinela_hora smallint not null default 9;
alter table radar_config add column if not exists sentinela_ultima date;
