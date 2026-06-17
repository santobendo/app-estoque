-- =============================================================
-- SISTEMA DE CONTROLE DE ESTOQUE
-- Supabase / PostgreSQL
-- Schema normalizado (1FN, 2FN, 3FN)
-- =============================================================

-- -------------------------------------------------------------
-- 1. PAPÉIS (ROLES)
--    Tabela normalizada de cargos/funções dos usuários.
--    Obs: "Admin" foi removido daqui — administração é controlada
--    pelo flag is_admin em perfis (campo técnico de sistema).
-- -------------------------------------------------------------
create table papeis (
  id          serial      primary key,
  nome        text        not null unique,
  descricao   text,
  criado_em   timestamptz not null default now()
);

comment on table  papeis      is 'Cargos/funções operacionais: Almoxarife, Cozinheiro, etc. Não inclui "Admin" — administração é controlada pelo flag is_admin em perfis.';
comment on column papeis.nome is 'Nome único do papel — evita duplicatas e variações de escrita.';

-- -------------------------------------------------------------
-- 2. PERFIS
--    Extensão da tabela auth.users do Supabase.
--    Criado automaticamente via trigger quando um usuário
--    se cadastra. Guarda dados extras como nome, papel e flag admin.
--    is_admin é flag técnico de sistema, independente do papel operacional.
-- -------------------------------------------------------------
create table perfis (
  id            uuid        primary key,
  nome          text        not null,
  papel_id      int,
  is_admin      boolean     not null default false,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint perfis_id_fk
    foreign key (id) references auth.users(id) on delete cascade,

  constraint perfis_papel_id_fk
    foreign key (papel_id) references papeis(id) on delete set null
);

comment on table  perfis          is 'Dados extras do usuário; espelha auth.users via trigger.';
comment on column perfis.id       is 'Mesmo UUID do auth.users — não é gerado aqui.';
comment on column perfis.papel_id is 'FK para papeis — cargo/função operacional do usuário.';
comment on column perfis.is_admin is 'Flag técnico de sistema. Se true, o usuário pode gerenciar perfis, papéis e dados mestres. Independente do papel operacional.';
comment on column perfis.ativo    is 'Se false, o usuário não pode realizar operações no sistema.';

-- Trigger: cria o perfil automaticamente ao criar usuário no Supabase Auth
create or replace function fn_cria_perfil()
returns trigger language plpgsql security definer as $$
begin
  insert into public.perfis (id, nome)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'nome', NEW.email)
  );
  return NEW;
end;
$$;

create trigger tg_cria_perfil
after insert on auth.users
for each row execute function fn_cria_perfil();

-- -------------------------------------------------------------
-- 3. CATEGORIAS
--    Tabela normalizada de categorias de produtos.
-- -------------------------------------------------------------
create table categorias (
  id          serial      primary key,
  nome        text        not null unique,
  descricao   text
);

comment on table  categorias      is 'Categorias de produtos: Limpeza, Alimentação, Escritório, etc.';
comment on column categorias.nome is 'Nome único da categoria — evita duplicatas e variações de escrita.';

-- -------------------------------------------------------------
-- 4. UNIDADES  [NOVO]
--    Normaliza as unidades de medida que antes eram texto livre
--    em apresentacoes.unidade. Garante consistência e evita
--    variações como "L", "l", "litro", "Litro".
-- -------------------------------------------------------------
create table unidades (
  id    serial primary key,
  sigla text   not null unique,
  nome  text
);

comment on table  unidades       is 'Unidades de medida: L, ml, kg, g, un, etc.';
comment on column unidades.sigla is 'Sigla única — usada como referência em apresentacoes.';
comment on column unidades.nome  is 'Nome completo da unidade: Litro, Mililitro, Quilograma, etc.';

-- -------------------------------------------------------------
-- 5. PRODUTOS
--    Representa o item genérico (ex: "Água Sanitária")
-- -------------------------------------------------------------
create table produtos (
  id            serial      primary key,
  nome          text        not null,
  categoria_id  int,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint produtos_categoria_id_fk
    foreign key (categoria_id) references categorias(id) on delete set null,

  constraint produtos_criado_por_fk
    foreign key (criado_por) references auth.users(id) on delete set null
);

comment on table  produtos              is 'Produto genérico, independente de embalagem ou tamanho.';
comment on column produtos.categoria_id is 'FK para categorias — agrupamento do produto.';
comment on column produtos.criado_por   is 'Usuário que cadastrou o produto.';

-- -------------------------------------------------------------
-- 6. APRESENTAÇÕES
--    Cada variação de embalagem/tamanho de um produto.
--    Ex: Água Sanitária 2L, Água Sanitária 5L.
--    unidade_id substitui o antigo campo texto livre "unidade".
-- -------------------------------------------------------------
create table apresentacoes (
  id                  serial        primary key,
  produto_id          int           not null,
  descricao           text          not null,
  quantidade_unitaria numeric(10,4) not null,
  unidade_id          int           not null,
  criado_por          uuid,
  criado_em           timestamptz   not null default now(),
  atualizado_em       timestamptz   not null default now(),

  constraint apresentacoes_quantidade_positiva
    check (quantidade_unitaria > 0),

  constraint apresentacoes_produto_id_fk
    foreign key (produto_id) references produtos(id) on delete cascade,

  constraint apresentacoes_unidade_id_fk
    foreign key (unidade_id) references unidades(id) on delete restrict,

  constraint apresentacoes_criado_por_fk
    foreign key (criado_por) references auth.users(id) on delete set null
);

comment on table  apresentacoes                    is 'Variações de embalagem/tamanho de um produto.';
comment on column apresentacoes.quantidade_unitaria is 'Quanto esta embalagem contém, na unidade base do produto.';
comment on column apresentacoes.unidade_id          is 'FK para unidades — substitui o antigo campo texto livre.';
comment on column apresentacoes.criado_por          is 'Usuário que cadastrou a apresentação.';

-- -------------------------------------------------------------
-- 7. LOCAIS
--    Locais físicos de armazenamento (almoxarifado, cozinha…)
-- -------------------------------------------------------------
create table locais (
  id          serial      primary key,
  nome        text        not null unique,
  descricao   text,
  ativo       boolean     not null default true,
  criado_por  uuid,
  criado_em   timestamptz not null default now(),

  constraint locais_criado_por_fk
    foreign key (criado_por) references auth.users(id) on delete set null
);

comment on table locais is 'Locais físicos onde o estoque é mantido.';

-- -------------------------------------------------------------
-- 8. ESTOQUES
--    Combinação apresentação × local; guarda quantidade atual
-- -------------------------------------------------------------
create table estoques (
  id               serial        primary key,
  apresentacao_id  int           not null,
  local_id         int           not null,
  quantidade_atual numeric(12,4) not null default 0,
  criado_em        timestamptz   not null default now(),
  atualizado_em    timestamptz   not null default now(),

  constraint estoques_combinacao_unica
    unique (apresentacao_id, local_id),

  constraint estoques_quantidade_nao_negativa
    check (quantidade_atual >= 0),

  constraint estoques_apresentacao_id_fk
    foreign key (apresentacao_id) references apresentacoes(id) on delete restrict,

  constraint estoques_local_id_fk
    foreign key (local_id) references locais(id) on delete restrict
);

comment on table  estoques                  is 'Saldo atual de cada apresentação em cada local.';
comment on column estoques.quantidade_atual is 'Cache atualizado via trigger a cada movimentação.';

-- -------------------------------------------------------------
-- 9. MOTIVOS DE MOVIMENTAÇÃO  [NOVO]
--    Normaliza o campo "motivo" que antes era texto livre em
--    movimentacoes. Garante consistência e permite que a lógica
--    de negócio (ex: excluir descartes do consumo) seja baseada
--    em IDs, não em strings comparadas manualmente.
-- -------------------------------------------------------------
create table motivos_movimentacao (
  id        serial  primary key,
  codigo    text    not null unique,
  descricao text    not null
);

comment on table  motivos_movimentacao        is 'Motivos possíveis para movimentações de estoque.';
comment on column motivos_movimentacao.codigo is 'Código curto único: uso, descarte, compra, ajuste, outro. Usado em lógicas de negócio.';

-- -------------------------------------------------------------
-- 10. MOVIMENTAÇÕES
--     Registro imutável de cada entrada ou saída.
--     motivo_id substitui o antigo campo texto livre "motivo".
-- -------------------------------------------------------------
create type tipo_movimentacao as enum ('entrada', 'saida');

create table movimentacoes (
  id          serial            primary key,
  estoque_id  int               not null,
  criado_por  uuid              not null,
  tipo        tipo_movimentacao not null,
  quantidade  numeric(12,4)     not null,
  motivo_id   int,
  data        timestamptz       not null default now(),
  criado_em   timestamptz       not null default now(),

  constraint movimentacoes_quantidade_positiva
    check (quantidade > 0),

  constraint movimentacoes_estoque_id_fk
    foreign key (estoque_id) references estoques(id) on delete restrict,

  constraint movimentacoes_criado_por_fk
    foreign key (criado_por) references auth.users(id) on delete restrict,

  constraint movimentacoes_motivo_id_fk
    foreign key (motivo_id) references motivos_movimentacao(id) on delete set null
);

comment on table  movimentacoes            is 'Registro imutável de entradas e saídas de estoque.';
comment on column movimentacoes.criado_por is 'Usuário responsável pela movimentação — obrigatório.';
comment on column movimentacoes.motivo_id  is 'FK para motivos_movimentacao — substitui o antigo campo texto livre.';
comment on column movimentacoes.data       is 'Data/hora do evento real (pode diferir de criado_em).';

-- -------------------------------------------------------------
-- 11. TRIGGER — atualiza quantidade_atual em estoques
--     automaticamente após cada movimentação inserida
-- -------------------------------------------------------------
create or replace function fn_atualiza_estoque()
returns trigger language plpgsql as $$
begin
  if NEW.tipo = 'entrada' then
    update estoques
       set quantidade_atual = quantidade_atual + NEW.quantidade,
           atualizado_em    = now()
     where id = NEW.estoque_id;
  else
    update estoques
       set quantidade_atual = quantidade_atual - NEW.quantidade,
           atualizado_em    = now()
     where id = NEW.estoque_id;
  end if;
  return NEW;
end;
$$;

create trigger tg_atualiza_estoque
after insert on movimentacoes
for each row execute function fn_atualiza_estoque();

-- -------------------------------------------------------------
-- 12. VIEW — consumo por produto nos últimos 30 dias
--     Ajustada para usar motivo_id em vez de texto livre.
--     O código 'descarte' é filtrado via join na tabela motivos.
-- -------------------------------------------------------------
create or replace view vw_consumo_30_dias as
select
  p.id                                        as produto_id,
  p.nome                                      as produto,
  c.nome                                      as categoria,
  u.sigla                                     as unidade,
  l.id                                        as local_id,
  l.nome                                      as local,
  round(
    sum(m.quantidade * a.quantidade_unitaria)
  , 4)                                        as consumo_total_unidade_base,
  e.quantidade_atual                          as estoque_atual_unidades,
  round(
    e.quantidade_atual * a.quantidade_unitaria
  , 4)                                        as estoque_atual_unidade_base
from movimentacoes       m
join estoques            e  on e.id  = m.estoque_id
join apresentacoes       a  on a.id  = e.apresentacao_id
join unidades            u  on u.id  = a.unidade_id
join produtos            p  on p.id  = a.produto_id
left join categorias     c  on c.id  = p.categoria_id
join locais              l  on l.id  = e.local_id
left join motivos_movimentacao mo on mo.id = m.motivo_id
where m.tipo    = 'saida'
  and (mo.codigo is null or mo.codigo != 'descarte')
  and m.data   >= now() - interval '30 days'
group by
  p.id, p.nome, c.nome,
  u.sigla,
  l.id, l.nome,
  e.quantidade_atual,
  a.quantidade_unitaria;

comment on view vw_consumo_30_dias is
  'Consumo real (excluindo descartes) dos últimos 30 dias por produto e local, com estoque atual.';

-- -------------------------------------------------------------
-- 13. VIEW — sugestão de compra para o próximo mês
-- -------------------------------------------------------------
create or replace view vw_sugestao_compra as
select
  produto_id,
  produto,
  categoria,
  local_id,
  local,
  unidade,
  consumo_total_unidade_base               as consumo_30_dias,
  estoque_atual_unidade_base               as estoque_atual,
  greatest(
    consumo_total_unidade_base - estoque_atual_unidade_base,
    0
  )                                        as quantidade_sugerida_compra
from vw_consumo_30_dias;

comment on view vw_sugestao_compra is
  'Sugestão de compra = consumo 30 dias − estoque atual (nunca negativo).';

-- -------------------------------------------------------------
-- 14. VIEW — auditoria de movimentações com nome do usuário
-- -------------------------------------------------------------
create or replace view vw_auditoria_movimentacoes as
select
  m.id,
  m.data,
  m.tipo,
  m.quantidade,
  a.quantidade_unitaria,
  u.sigla                                  as unidade,
  mo.codigo                                as motivo,
  mo.descricao                             as motivo_descricao,
  p.nome                                   as produto,
  a.descricao                              as apresentacao,
  l.nome                                   as local,
  pf.nome                                  as usuario,
  pa.nome                                  as cargo_usuario,
  pf.is_admin                              as usuario_admin
from movimentacoes            m
join estoques                 e  on e.id  = m.estoque_id
join apresentacoes            a  on a.id  = e.apresentacao_id
join unidades                 u  on u.id  = a.unidade_id
join produtos                 p  on p.id  = a.produto_id
join locais                   l  on l.id  = e.local_id
join perfis                   pf on pf.id = m.criado_por
left join papeis              pa on pa.id = pf.papel_id
left join motivos_movimentacao mo on mo.id = m.motivo_id
order by m.data desc;

comment on view vw_auditoria_movimentacoes is
  'Histórico completo de movimentações com produto, local e usuário responsável.';

-- -------------------------------------------------------------
-- 15. ÍNDICES — performance em consultas comuns
-- -------------------------------------------------------------
create index idx_movimentacoes_estoque_data on movimentacoes(estoque_id, data desc);
create index idx_movimentacoes_tipo_data    on movimentacoes(tipo, data desc);
create index idx_movimentacoes_criado_por   on movimentacoes(criado_por);
create index idx_movimentacoes_motivo_id    on movimentacoes(motivo_id);
create index idx_estoques_apresentacao      on estoques(apresentacao_id);
create index idx_estoques_local             on estoques(local_id);
create index idx_apresentacoes_produto      on apresentacoes(produto_id);
create index idx_apresentacoes_unidade      on apresentacoes(unidade_id);
create index idx_perfis_papel               on perfis(papel_id);
create index idx_produtos_categoria         on produtos(categoria_id);

-- -------------------------------------------------------------
-- 16. FUNÇÕES AUXILIARES PARA RLS
-- -------------------------------------------------------------
create or replace function fn_is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_admin from perfis where id = auth.uid()),
    false
  );
$$;

create or replace function fn_is_ativo()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select ativo from perfis where id = auth.uid()),
    false
  );
$$;

comment on function fn_is_admin() is 'Retorna true se o usuário logado é administrador.';
comment on function fn_is_ativo() is 'Retorna true se o usuário logado está ativo no sistema.';

-- -------------------------------------------------------------
-- 17. ROW LEVEL SECURITY (RLS)
-- -------------------------------------------------------------
alter table papeis               enable row level security;
alter table categorias           enable row level security;
alter table unidades             enable row level security;
alter table motivos_movimentacao enable row level security;
alter table perfis               enable row level security;
alter table produtos             enable row level security;
alter table apresentacoes        enable row level security;
alter table locais               enable row level security;
alter table estoques             enable row level security;
alter table movimentacoes        enable row level security;

-- === LEITURA — todos autenticados ===
create policy "autenticados podem ler papeis"
  on papeis for select to authenticated using (true);

create policy "autenticados podem ler categorias"
  on categorias for select to authenticated using (true);

create policy "autenticados podem ler unidades"
  on unidades for select to authenticated using (true);

create policy "autenticados podem ler motivos_movimentacao"
  on motivos_movimentacao for select to authenticated using (true);

create policy "autenticados podem ler perfis"
  on perfis for select to authenticated using (true);

create policy "autenticados podem ler produtos"
  on produtos for select to authenticated using (true);

create policy "autenticados podem ler apresentacoes"
  on apresentacoes for select to authenticated using (true);

create policy "autenticados podem ler locais"
  on locais for select to authenticated using (true);

create policy "autenticados podem ler estoques"
  on estoques for select to authenticated using (true);

create policy "autenticados podem ler movimentacoes"
  on movimentacoes for select to authenticated using (true);

-- === INSERÇÃO — apenas usuários ativos ===
create policy "ativos podem inserir produtos"
  on produtos for insert to authenticated
  with check (fn_is_ativo());

create policy "ativos podem inserir apresentacoes"
  on apresentacoes for insert to authenticated
  with check (fn_is_ativo());

create policy "ativos podem inserir locais"
  on locais for insert to authenticated
  with check (fn_is_ativo());

create policy "ativos podem inserir estoques"
  on estoques for insert to authenticated
  with check (fn_is_ativo());

create policy "ativos podem inserir movimentacoes"
  on movimentacoes for insert to authenticated
  with check (criado_por = auth.uid() and fn_is_ativo());

-- === ATUALIZAÇÃO — perfil próprio ===
create policy "usuario edita proprio perfil"
  on perfis for update to authenticated
  using (id = auth.uid());

-- === ADMINISTRAÇÃO — apenas admins ===
create policy "admin pode atualizar qualquer perfil"
  on perfis for update to authenticated
  using (fn_is_admin());

create policy "admin pode inserir papeis"
  on papeis for insert to authenticated
  with check (fn_is_admin());

create policy "admin pode atualizar papeis"
  on papeis for update to authenticated
  using (fn_is_admin());

create policy "admin pode deletar papeis"
  on papeis for delete to authenticated
  using (fn_is_admin());

create policy "admin pode inserir categorias"
  on categorias for insert to authenticated
  with check (fn_is_admin());

create policy "admin pode atualizar categorias"
  on categorias for update to authenticated
  using (fn_is_admin());

create policy "admin pode deletar categorias"
  on categorias for delete to authenticated
  using (fn_is_admin());

create policy "admin pode gerenciar unidades"
  on unidades for all to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy "admin pode gerenciar motivos_movimentacao"
  on motivos_movimentacao for all to authenticated
  using (fn_is_admin()) with check (fn_is_admin());

create policy "admin pode atualizar produtos"
  on produtos for update to authenticated
  using (fn_is_admin());

create policy "admin pode atualizar apresentacoes"
  on apresentacoes for update to authenticated
  using (fn_is_admin());

create policy "admin pode atualizar locais"
  on locais for update to authenticated
  using (fn_is_admin());

-- -------------------------------------------------------------
-- 18. TRIGGER — protege campos sensíveis do perfil
-- -------------------------------------------------------------
create or replace function fn_protege_perfil()
returns trigger language plpgsql security definer as $$
begin
  if not fn_is_admin() then
    if NEW.is_admin is distinct from OLD.is_admin then
      raise exception 'Apenas administradores podem alterar o campo is_admin.';
    end if;
    if NEW.ativo is distinct from OLD.ativo then
      raise exception 'Apenas administradores podem ativar/desativar usuários.';
    end if;
    if NEW.papel_id is distinct from OLD.papel_id then
      raise exception 'Apenas administradores podem alterar o papel do usuário.';
    end if;
  end if;
  NEW.atualizado_em := now();
  return NEW;
end;
$$;

create trigger tg_protege_perfil
before update on perfis
for each row execute function fn_protege_perfil();

comment on function fn_protege_perfil() is
  'Impede que não-admins alterem is_admin, ativo ou papel_id. Atualiza atualizado_em automaticamente.';

-- -------------------------------------------------------------
-- 19. DADOS INICIAIS
-- -------------------------------------------------------------

-- Papéis operacionais (sem "Admin" — administração é via is_admin)
insert into papeis (nome, descricao) values
  ('Almoxarife',  'Controla entrada e saída de materiais'),
  ('Cozinheiro',  'Registra consumo de itens na cozinha');

insert into categorias (nome) values
  ('Limpeza'),
  ('Higiene'),
  ('Alimentação'),
  ('Escritório');

-- Unidades de medida normalizadas
insert into unidades (sigla, nome) values
  ('L',   'Litro'),
  ('ml',  'Mililitro'),
  ('kg',  'Quilograma'),
  ('g',   'Grama'),
  ('un',  'Unidade');

-- Motivos de movimentação normalizados
insert into motivos_movimentacao (codigo, descricao) values
  ('uso',      'Consumo regular'),
  ('descarte', 'Item descartado por validade, dano ou inutilidade'),
  ('compra',   'Entrada por compra ou recebimento'),
  ('ajuste',   'Ajuste de inventário'),
  ('outro',    'Outro motivo não categorizado');

insert into locais (nome, descricao) values
  ('Almoxarifado', 'Depósito principal'),
  ('Cozinha',      'Estoque de uso diário da cozinha');

insert into produtos (nome, categoria_id) values
  ('Água Sanitária', (select id from categorias where nome = 'Limpeza')),
  ('Detergente',     (select id from categorias where nome = 'Limpeza')),
  ('Papel Toalha',   (select id from categorias where nome = 'Higiene'));

insert into apresentacoes (produto_id, descricao, quantidade_unitaria, unidade_id) values
  (1, 'Frasco 2L',    2,   (select id from unidades where sigla = 'L')),
  (1, 'Galão 5L',     5,   (select id from unidades where sigla = 'L')),
  (2, 'Frasco 500ml', 0.5, (select id from unidades where sigla = 'L')),
  (3, 'Rolo',         1,   (select id from unidades where sigla = 'un'));

insert into estoques (apresentacao_id, local_id) values
  (1, 1),  -- Água Sanitária 2L  / Almoxarifado
  (2, 1),  -- Água Sanitária 5L  / Almoxarifado
  (3, 1),  -- Detergente 500ml   / Almoxarifado
  (4, 1),  -- Papel Toalha Rolo  / Almoxarifado
  (3, 2),  -- Detergente 500ml   / Cozinha
  (4, 2);  -- Papel Toalha Rolo  / Cozinha

-- =============================================================
-- NOTA: PRIMEIRO ADMINISTRADOR
-- O trigger fn_cria_perfil cria todo perfil com is_admin = false.
-- Após criar seu primeiro usuário, promova-o a admin via SQL:
--
--   update perfis set is_admin = true where id = '<seu-user-uuid>';
--
-- =============================================================

-- =============================================================
-- NOTA: BLOQUEIO COMPLETO DE LOGIN
-- Para impedir que um usuário desativado sequer faça login,
-- use a API Admin do Supabase via Edge Function:
--
--   -- Banir:
--   await supabase.auth.admin.updateUserById(userId, {
--     ban_duration: '876000h'
--   })
--
--   -- Desbanir:
--   await supabase.auth.admin.updateUserById(userId, {
--     ban_duration: 'none'
--   })
--
-- Isso garante dupla proteção: RLS no banco + Auth no Supabase.
-- =============================================================
