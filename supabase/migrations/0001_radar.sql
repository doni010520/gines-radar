-- Radar de oportunidades (app gines-radar). Mora no mesmo Supabase do atendimento, mas
-- só em tabelas com prefixo radar_ — não toca em nada do atendimento. Login é o mesmo
-- (auth.users/profiles compartilhados).

create table if not exists radar_bairros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                       -- como o portal escreve: "Pinheiros"
  zona text not null default '',            -- ZAP pede a zona junto: "Zona Oeste"
  cidade text not null default 'São Paulo',
  estado text not null default 'São Paulo',
  teto_m2 numeric,                          -- R$/m² máximo; nulo = usa % abaixo da média
  pct_abaixo_media numeric not null default 40,
  tipos text[] not null default '{HOME,TWO_STORY_HOUSE,CONDOMINIUM,RESIDENTIAL_ALLOTMENT_LAND,APARTMENT}',
  ativo boolean not null default true,
  aprendido_em timestamptz,                 -- 1ª varredura: só aprende a média, não alerta
  ultima_varredura timestamptz,
  created_at timestamptz not null default now(),
  unique (nome, zona, cidade)
);

create table if not exists radar_palavras (
  id uuid primary key default gen_random_uuid(),
  termo text not null unique,
  categoria text not null default 'outro',  -- obra | terreno | juridico | outro
  ativo boolean not null default true
);

create table if not exists radar_anuncios (
  id text primary key,                      -- "zap:2916180653"
  portal text not null,
  bairro_id uuid references radar_bairros(id) on delete set null,
  tipo text,
  titulo text,
  url text,
  preco numeric,
  area numeric,
  preco_m2 numeric,
  descricao text,
  palavras text[] not null default '{}',
  anunciante text,
  criado_no_portal timestamptz,
  visto_em timestamptz not null default now(),
  oportunidade boolean not null default false,
  motivo text,
  pct_abaixo numeric,
  alertado_em timestamptz,
  descartado boolean not null default false
);
create index if not exists radar_anuncios_bairro_idx on radar_anuncios(bairro_id, visto_em desc);
create index if not exists radar_anuncios_oport_idx on radar_anuncios(oportunidade, visto_em desc);

create table if not exists radar_config (
  id boolean primary key default true check (id),
  ativo boolean not null default true,
  intervalo_min int not null default 30 check (intervalo_min >= 10),
  alerta_numero text,                       -- WhatsApp do Gines; vazio = só registra no painel
  updated_at timestamptz not null default now()
);
insert into radar_config (id) values (true) on conflict do nothing;

create table if not exists radar_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null,
  message text not null,
  meta jsonb
);

alter table radar_bairros enable row level security;
alter table radar_palavras enable row level security;
alter table radar_anuncios enable row level security;
alter table radar_config enable row level security;
alter table radar_logs enable row level security;
create policy "radar_bairros auth" on radar_bairros for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "radar_palavras auth" on radar_palavras for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "radar_anuncios auth" on radar_anuncios for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "radar_config auth" on radar_config for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "radar_logs auth" on radar_logs for select using (auth.role() = 'authenticated');

-- palavras da especificação do Gines (editáveis no painel)
insert into radar_palavras (termo, categoria) values
  ('precisa de reforma','obra'),('reforma completa','obra'),('imovel antigo','obra'),
  ('necessita modernizacao','obra'),('estado original','obra'),('para demolir','obra'),
  ('somente terreno','terreno'),('valor de terreno','terreno'),('ideal para construtor','terreno'),
  ('pendencia de documento','juridico'),('pendencia documental','juridico'),('inventario','juridico'),
  ('contrato de gaveta','juridico'),('somente a vista','juridico'),('nao aceita financiamento','juridico'),
  ('urgente','juridico')
on conflict (termo) do nothing;
