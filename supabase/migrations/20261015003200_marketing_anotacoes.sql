-- =====================================================================
-- BKM Terrenos · anotações do Marketing no mapa (pedido do Moises, 16/nov/2026)
-- Quem é do Marketing marca no mapa pinos, áreas (poligonais desenhadas) e rotas, cada um com nome e texto, que aparecem
-- numa caixa ao parar o mouse 1 s em cima. A rota guarda o endereço da saída e da chegada, a distância e os tempos
-- a pé e, quando a pé passa de 15 minutos, de carro e de transporte público (calculados uma vez, ao salvar).
--
-- Só o Marketing lê e grava: as anotações não são dos terrenos nem aparecem para os outros papéis (nem para o
-- diretor). Todas as pessoas do Marketing da empresa veem e editam as mesmas anotações.
-- =====================================================================

create table app.marketing_anotacoes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id) on delete cascade,
  tipo             text not null check (tipo in ('pino','area','rota')),
  nome             text not null default '' check (length(nome) <= 200),
  -- pino: o ponto; área: um ponto dentro dela (onde a caixa abre); rota: a saída
  latitude         double precision not null check (latitude between -90 and 90),
  longitude        double precision not null check (longitude between -180 and 180),
  texto            text check (length(texto) <= 4000),
  -- área: o anel [[lat,lng],...]; rota: o caminho a pé [[lat,lng],...]
  pontos           jsonb check (pontos is null or jsonb_typeof(pontos) = 'array'),
  -- só da rota
  endereco         text,
  latitude_destino double precision check (latitude_destino between -90 and 90),
  longitude_destino double precision check (longitude_destino between -180 and 180),
  endereco_destino text,
  texto_destino    text check (length(texto_destino) <= 4000),
  distancia_m      integer check (distancia_m >= 0),
  pe_s             integer check (pe_s >= 0),
  carro_s          integer check (carro_s >= 0),
  transporte_s     integer check (transporte_s >= 0),
  transporte_linhas text[],
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid,
  check (tipo <> 'area' or jsonb_array_length(pontos) >= 3),
  check (tipo <> 'rota' or (latitude_destino is not null and longitude_destino is not null))
);
create index on app.marketing_anotacoes (empresa_id);
create trigger t_upd before update on app.marketing_anotacoes for each row execute function app.tg_atualizado_em();

alter table app.marketing_anotacoes enable row level security;
create policy marketing_anotacoes on app.marketing_anotacoes for all to authenticated
  using (empresa_id in (select app.empresas_marketing()))
  with check (empresa_id in (select app.empresas_marketing()));
revoke all on app.marketing_anotacoes from public, anon, authenticated;
grant select, insert, update, delete on app.marketing_anotacoes to authenticated;
