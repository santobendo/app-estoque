# Migração 08 — Requisições

Rode no **banco de testes** primeiro. As quatro partes são independentes e cada
uma é um bloco único: copie a parte inteira de uma vez. Não divida um bloco em
vários "Run" — o SQL Editor abre uma conexão nova por execução, e um `begin;`
sozinho fica órfão e volta atrás (foi o que aconteceu na migração 05).

Decisões que esta migração implementa, conforme combinado:

- **Sem coluna `data`** em `requisicoes` — `criado_em` faz esse papel
- **Criação tardia** — a requisição nasce na primeira saída gravada, dentro da
  mesma transação da movimentação
- **Mesmo produto/local duas vezes reaproveita o item** — a segunda retirada é
  outra movimentação do mesmo item, e a entregue acumula sozinha
- **`quantidade_entregue` não é coluna** — é soma das movimentações do item
- **Policies já na forma final por local** — o recorte "só admin" fica na tela,
  não no banco (ver a nota no fim do arquivo)

---

## Parte 1 — estrutura

```sql
begin;

-- -----------------------------------------------------------------
-- requisicoes — o cabeçalho. O id é o "número" da requisição.
-- Sem coluna "data": criado_em já é a data de criação. Guardar as duas
-- significaria duas verdades para a mesma coisa, e elas divergem no dia em
-- que alguém editar uma e não a outra.
-- -----------------------------------------------------------------
create table requisicoes (
  id            serial      primary key,
  digitado_por  uuid        not null,
  entregue_por  uuid        not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  constraint requisicoes_digitado_por_fk
    foreign key (digitado_por) references perfis(id) on delete restrict,

  constraint requisicoes_entregue_por_fk
    foreign key (entregue_por) references perfis(id) on delete restrict
);

comment on table  requisicoes               is 'Cabeçalho da requisição. O id é o número exibido ao usuário. Uma requisição pode ter itens de locais diferentes.';
comment on column requisicoes.digitado_por  is 'Quem digitou o pedido. Só admin pode indicar outra pessoa.';
comment on column requisicoes.entregue_por  is 'Quem entregou os itens. Só admin pode indicar outra pessoa.';
comment on column requisicoes.criado_em     is 'Data de criação da requisição — é a data da requisição, não existe coluna separada para isso.';
comment on column requisicoes.atualizado_em is 'Atualizada por trigger a cada item ou entrega. Ordena o modal de requisições existentes.';

-- -----------------------------------------------------------------
-- requisicao_itens — o que foi pedido, e onde.
-- Aponta para apresentacao + local, não para a movimentação, porque a tela
-- dedicada vai criar o item antes de existir qualquer entrega (pedir 10 hoje,
-- entregar 8 amanhã e 2 depois).
-- -----------------------------------------------------------------
create table requisicao_itens (
  id                    serial        primary key,
  requisicao_id         int           not null,
  apresentacao_id       int           not null,
  local_id              int           not null,
  quantidade_solicitada numeric(12,4) not null,
  criado_em             timestamptz   not null default now(),

  constraint requisicao_itens_solicitada_positiva
    check (quantidade_solicitada > 0),

  constraint requisicao_itens_requisicao_fk
    foreign key (requisicao_id) references requisicoes(id) on delete cascade,

  constraint requisicao_itens_apresentacao_fk
    foreign key (apresentacao_id) references apresentacoes(id) on delete restrict,

  constraint requisicao_itens_local_fk
    foreign key (local_id) references locais(id) on delete restrict
);

comment on table  requisicao_itens                       is 'Itens de uma requisição: o que foi pedido, em qual local e quanto. A quantidade entregue não é coluna — é a soma das movimentações vinculadas ao item.';
comment on column requisicao_itens.local_id              is 'Local de retirada do item. É o que permite RLS por local em uma requisição que cruza locais.';
comment on column requisicao_itens.quantidade_solicitada is 'Quanto foi pedido, em embalagens. Pode divergir da entregue — pediu 10, tinha 8.';

-- Um produto aparece uma vez por requisição e local: a segunda retirada do
-- mesmo item entra como outra movimentação, não como item novo. O índice é
-- único para que duas abas disputando não criem itens duplicados.
create unique index idx_requisicao_itens_unico
  on requisicao_itens (requisicao_id, apresentacao_id, local_id);

create index idx_requisicao_itens_requisicao on requisicao_itens (requisicao_id);
create index idx_requisicao_itens_local      on requisicao_itens (local_id);
create index idx_requisicoes_atualizado      on requisicoes (atualizado_em desc);

-- -----------------------------------------------------------------
-- movimentacoes ganha o vínculo com o item. É a entrega.
-- on delete set null: apagar um item não apaga histórico de estoque. No
-- sentido contrário não há efeito nenhum — excluir a movimentação deixa o
-- item em pé com entregue zero, que é a leitura correta de "foi pedido e
-- não foi entregue".
-- -----------------------------------------------------------------
alter table movimentacoes
  add column requisicao_item_id int;

alter table movimentacoes
  add constraint movimentacoes_requisicao_item_fk
    foreign key (requisicao_item_id) references requisicao_itens(id) on delete set null;

comment on column movimentacoes.requisicao_item_id is 'Item de requisição atendido por esta movimentação. Null em movimentação sem requisição.';

-- Parcial: a grande maioria das movimentações não tem requisição, e o índice
-- só serve para somar a quantidade entregue de um item.
create index idx_movimentacoes_requisicao_item
  on movimentacoes (requisicao_item_id) where requisicao_item_id is not null;

commit;
```

---

## Parte 2 — permissões e RLS

```sql
begin;

alter table requisicoes      enable row level security;
alter table requisicao_itens enable row level security;

-- GRANT explícito: tabela criada por migração não herda privilégio nenhum.
-- Sem isto o Postgres barra antes de olhar o RLS, com
-- "42501: permission denied for table requisicoes".
grant select, insert, update, delete
  on public.requisicoes, public.requisicao_itens to authenticated;

-- A sequence tem privilégio próprio. Sem isto a leitura funciona e só o
-- primeiro insert falha, com "permission denied for sequence".
grant usage, select
  on sequence public.requisicoes_id_seq, public.requisicao_itens_id_seq
  to authenticated;

-- === Cabeçalho ===
-- Legível por qualquer usuário ativo, e é isso que torna a requisição
-- cruzando locais possível: o gerente da Cozinha precisa achar, no modal, a
-- requisição que o gerente do Almoxarifado começou. O que fica exposto é
-- número, data e os dois nomes — sem produto e sem quantidade, que moram nos
-- itens e são filtrados por local.
create policy "autenticados leem requisicoes"
  on requisicoes for select to authenticated
  using (fn_is_ativo());

-- Mesma régua de produtos e apresentacoes: o cabeçalho não tem local, então
-- basta gerenciar algum. Não-admin só pode se pôr como responsável — é o
-- mesmo desenho do criado_por em movimentacoes.
create policy "gestores podem inserir requisicoes"
  on requisicoes for insert to authenticated
  with check (
    fn_pode_editar_algum_local()
    and (
      fn_is_admin()
      or (digitado_por = auth.uid() and entregue_por = auth.uid())
    )
  );

create policy "admin pode atualizar requisicoes"
  on requisicoes for update to authenticated
  using (fn_is_admin());

create policy "admin pode deletar requisicoes"
  on requisicoes for delete to authenticated
  using (fn_is_admin());

-- === Itens ===
-- Aqui o recorte é por local, pela mesma cadeia que estoques e movimentacoes
-- já usam. O gerente da Cozinha vê os itens dela e não vê os do Almoxarifado,
-- mesmo estando na mesma requisição.
create policy "usuario le itens de requisicao dos locais permitidos"
  on requisicao_itens for select to authenticated
  using (fn_pode_ver_local(local_id));

create policy "gestores podem inserir itens de requisicao"
  on requisicao_itens for insert to authenticated
  with check (fn_pode_editar_local(local_id));

create policy "admin pode atualizar itens de requisicao"
  on requisicao_itens for update to authenticated
  using (fn_is_admin());

create policy "admin pode deletar itens de requisicao"
  on requisicao_itens for delete to authenticated
  using (fn_is_admin());

commit;
```

---

## Parte 3 — trigger e função de gravação

```sql
begin;

-- -----------------------------------------------------------------
-- atualizado_em da requisição
-- security definer porque não existe policy de UPDATE em requisicoes para
-- não-admin — de propósito: dar UPDATE ao usuário comum deixaria ele trocar
-- os responsáveis de qualquer requisição. O trigger toca só esta coluna.
-- Dispara nos dois eventos que são alteração na prática: item novo e
-- entrega nova.
-- -----------------------------------------------------------------
create or replace function fn_toca_requisicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requisicao_id int;
begin
  if tg_table_name = 'requisicao_itens' then
    v_requisicao_id := new.requisicao_id;
  else
    select requisicao_id into v_requisicao_id
      from requisicao_itens where id = new.requisicao_item_id;
  end if;

  if v_requisicao_id is not null then
    update requisicoes set atualizado_em = now() where id = v_requisicao_id;
  end if;

  return new;
end;
$$;

comment on function fn_toca_requisicao() is
  'Atualiza requisicoes.atualizado_em quando entra um item ou uma entrega. Security definer porque usuário comum não tem UPDATE em requisicoes.';

create trigger tg_toca_requisicao_item
  after insert on requisicao_itens
  for each row
  execute function fn_toca_requisicao();

create trigger tg_toca_requisicao_entrega
  after insert on movimentacoes
  for each row
  when (new.requisicao_item_id is not null)
  execute function fn_toca_requisicao();

-- -----------------------------------------------------------------
-- fn_registra_saida_requisicao — grava a saída com requisição em uma
-- transação só: cria o cabeçalho se for a primeira saída, cria ou
-- reaproveita o item, e lança a movimentação. Se qualquer etapa falhar,
-- nada é gravado — mesmo desenho de fn_cria_produto_completo.
-- security invoker: o RLS do usuário logado vale em cada insert.
-- -----------------------------------------------------------------
create or replace function fn_registra_saida_requisicao(
  p_estoque_id            int,
  p_quantidade            numeric,
  p_quantidade_solicitada numeric     default null,
  p_motivo_id             int         default null,
  p_data                  timestamptz default null,
  p_requisicao_id         int         default null,
  p_digitado_por          uuid        default null,
  p_entregue_por          uuid        default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_local_id   int;
  v_ap_id      int;
  v_req_id     int := p_requisicao_id;
  v_item_id    int;
  v_solicitada numeric;
  v_mov_id     int;
  v_digitado   uuid;
  v_entregue   uuid;
  v_item_novo  boolean := false;
begin
  -- O select passa pelo RLS: estoque de local sem permissão não aparece, e o
  -- erro sai aqui com mensagem própria em vez de estourar no insert.
  select e.local_id, e.apresentacao_id
    into v_local_id, v_ap_id
    from estoques e
   where e.id = p_estoque_id;

  if v_local_id is null then
    raise exception 'Estoque não encontrado ou sem permissão neste local.'
      using errcode = '42501';
  end if;

  if v_req_id is not null then
    perform 1 from requisicoes where id = v_req_id;
    if not found then
      raise exception 'Requisição % não encontrada.', v_req_id
        using errcode = '23503';
    end if;
  else
    -- Só admin indica outra pessoa; para os demais o responsável é quem
    -- opera. A policy exige o mesmo, então não dá para contornar pela API.
    if fn_is_admin() then
      v_digitado := coalesce(p_digitado_por, auth.uid());
      v_entregue := coalesce(p_entregue_por, auth.uid());
    else
      v_digitado := auth.uid();
      v_entregue := auth.uid();
    end if;

    insert into requisicoes (digitado_por, entregue_por)
    values (v_digitado, v_entregue)
    returning id into v_req_id;
  end if;

  -- Mesmo produto e mesmo local na mesma requisição reaproveitam o item: a
  -- segunda retirada é outra movimentação dele, e a quantidade entregue, que
  -- é soma, acumula sozinha. A solicitada continua a da primeira vez — pedir
  -- duas vezes o mesmo item não teria sentido.
  select id, quantidade_solicitada
    into v_item_id, v_solicitada
    from requisicao_itens
   where requisicao_id   = v_req_id
     and apresentacao_id = v_ap_id
     and local_id        = v_local_id;

  if v_item_id is null then
    insert into requisicao_itens
      (requisicao_id, apresentacao_id, local_id, quantidade_solicitada)
    values
      (v_req_id, v_ap_id, v_local_id,
       coalesce(nullif(p_quantidade_solicitada, 0), p_quantidade))
    returning id, quantidade_solicitada into v_item_id, v_solicitada;
    v_item_novo := true;
  end if;

  insert into movimentacoes
    (estoque_id, criado_por, tipo, quantidade, motivo_id, data, requisicao_item_id)
  values
    (p_estoque_id, auth.uid(), 'saida', p_quantidade, p_motivo_id,
     coalesce(p_data, now()), v_item_id)
  returning id into v_mov_id;

  return jsonb_build_object(
    'requisicao_id',         v_req_id,
    'requisicao_item_id',    v_item_id,
    'movimentacao_id',       v_mov_id,
    'quantidade_solicitada', v_solicitada,
    'item_novo',             v_item_novo
  );
end;
$$;

comment on function fn_registra_saida_requisicao(int, numeric, numeric, int, timestamptz, int, uuid, uuid) is
  'Registra uma saída vinculada a requisição em transação única: cria o cabeçalho na primeira saída, cria ou reaproveita o item e grava a movimentação. Usada pela tela de Movimentações.';

commit;
```

---

## Parte 4 — views

```sql
begin;

-- -----------------------------------------------------------------
-- vw_requisicoes — o que o modal de requisições existentes lê.
-- A contagem de itens respeita o RLS (security_invoker), então o gerente da
-- Cozinha vê "2 itens" numa requisição de 5 se 3 são de outro local. É
-- coerente com o resto da tela, que também só mostra o que ele pode ver.
-- -----------------------------------------------------------------
create or replace view vw_requisicoes as
select
  r.id,
  r.criado_em,
  r.atualizado_em,
  r.digitado_por,
  pd.nome as digitado_por_nome,
  r.entregue_por,
  pe.nome as entregue_por_nome,
  (select count(*)
     from requisicao_itens i
    where i.requisicao_id = r.id)                        as itens,
  (select coalesce(sum(i.quantidade_solicitada), 0)
     from requisicao_itens i
    where i.requisicao_id = r.id)                        as total_solicitado
from requisicoes r
left join perfis pd on pd.id = r.digitado_por
left join perfis pe on pe.id = r.entregue_por
order by r.atualizado_em desc;

alter view vw_requisicoes set (security_invoker = on);

comment on view vw_requisicoes is
  'Cabeçalho das requisições com nomes dos responsáveis e contagem de itens visíveis ao usuário. Ordenada por última alteração, para o modal de requisição existente.';

-- -----------------------------------------------------------------
-- vw_requisicao_itens — itens com a quantidade entregue derivada.
-- A entregue é soma das movimentações do item, não coluna: estoques.
-- quantidade_atual já nos ensinou o preço de manter cache à mão, e hoje o
-- admin pode excluir movimentação. Derivada, ela se corrige sozinha.
-- -----------------------------------------------------------------
create or replace view vw_requisicao_itens as
select
  i.id,
  i.requisicao_id,
  i.apresentacao_id,
  i.local_id,
  i.quantidade_solicitada,
  coalesce((select sum(m.quantidade)
              from movimentacoes m
             where m.requisicao_item_id = i.id), 0)       as quantidade_entregue,
  p.id        as produto_id,
  p.nome      as produto,
  a.descricao as apresentacao,
  a.quantidade_unitaria,
  u.sigla     as unidade,
  l.nome      as local,
  i.criado_em
from requisicao_itens i
join apresentacoes a on a.id = i.apresentacao_id
join produtos      p on p.id = a.produto_id
join unidades      u on u.id = a.unidade_id
join locais        l on l.id = i.local_id
order by i.criado_em desc;

alter view vw_requisicao_itens set (security_invoker = on);

comment on view vw_requisicao_itens is
  'Itens de requisição com produto, local, solicitada e entregue. A entregue é a soma das movimentações vinculadas ao item.';

notify pgrst, 'reload schema';

commit;
```

---

## Testes

Pegue seu uuid primeiro — ele entra nos blocos seguintes:

```sql
select id, nome, is_admin from perfis order by nome;
```

### 1. Estrutura — um veredito só

```sql
select
  (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('requisicoes', 'requisicao_itens'))              as tabelas,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'movimentacoes'
      and column_name = 'requisicao_item_id')                             as coluna_movimentacoes,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('requisicoes', 'requisicao_itens'))               as policies,
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('requisicoes', 'requisicao_itens'))              as grants,
  (select count(*) from pg_views
    where schemaname = 'public'
      and viewname in ('vw_requisicoes', 'vw_requisicao_itens'))          as views,
  (select count(*) from pg_trigger
    where tgname in ('tg_toca_requisicao_item', 'tg_toca_requisicao_entrega')) as triggers;
```

Esperado: `2 | 1 | 8 | 8 | 2 | 2`. Os grants contam 4 privilégios × 2 tabelas.

### 2. Gravar uma saída com requisição nova

Troque `SEU_UUID`. Roda em `begin/rollback`, então **não grava nada** — é só
para ver o mecanismo funcionando com o RLS de um usuário de verdade.

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"SEU_UUID","role":"authenticated"}';

create temp table _alvo as
select e.id as estoque_id
  from estoques e
 where e.quantidade_atual >= 2
   and fn_pode_editar_local(e.local_id)
 limit 1;

select fn_registra_saida_requisicao(
  p_estoque_id            := (select estoque_id from _alvo),
  p_quantidade            := 1,
  p_quantidade_solicitada := 5
) as primeira_saida;

rollback;
```

Esperado: um json com `requisicao_id`, `requisicao_item_id`, `movimentacao_id`,
`"quantidade_solicitada": 5` e `"item_novo": true`.

Se vier `Estoque não encontrado ou sem permissão neste local`, a tabela `_alvo`
saiu vazia: não há estoque com saldo ≥ 2 em local que esse usuário gerencia.
Confira com `select count(*) from estoques where quantidade_atual >= 2;` fora da
transação.

### 3. Segunda saída do mesmo produto reaproveita o item

É o teste da decisão de somar a entrega em vez de duplicar o item.

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"SEU_UUID","role":"authenticated"}';

create temp table _alvo as
select e.id as estoque_id
  from estoques e
 where e.quantidade_atual >= 3
   and fn_pode_editar_local(e.local_id)
 limit 1;

create temp table _r1 as
select fn_registra_saida_requisicao(
  p_estoque_id            := (select estoque_id from _alvo),
  p_quantidade            := 2,
  p_quantidade_solicitada := 5) as j;

create temp table _r2 as
select fn_registra_saida_requisicao(
  p_estoque_id            := (select estoque_id from _alvo),
  p_quantidade            := 1,
  p_quantidade_solicitada := 99,
  p_requisicao_id         := ((select j from _r1)->>'requisicao_id')::int) as j;

select
  ((select j from _r1)->>'requisicao_id')::int
    = ((select j from _r2)->>'requisicao_id')::int                as mesma_requisicao,
  ((select j from _r1)->>'requisicao_item_id')::int
    = ((select j from _r2)->>'requisicao_item_id')::int           as mesmo_item,
  ((select j from _r2)->>'item_novo')::boolean                    as item_novo_na_segunda,
  (select quantidade_entregue from vw_requisicao_itens
    where id = ((select j from _r2)->>'requisicao_item_id')::int) as entregue,
  (select quantidade_solicitada from vw_requisicao_itens
    where id = ((select j from _r2)->>'requisicao_item_id')::int) as solicitada;

rollback;
```

Esperado: `true | true | false | 3 | 5`. A entregue somou as duas retiradas, e a
solicitada ficou com o valor da primeira — o 99 da segunda foi descartado, que é
exatamente o comportamento combinado.

### 4. Requisição cruzando locais

Precisa de dois locais com saldo. Como admin, uma requisição deve aceitar item
do local A e do local B.

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"SEU_UUID_ADMIN","role":"authenticated"}';

create temp table _dois as
select distinct on (e.local_id) e.id as estoque_id, e.local_id
  from estoques e
 where e.quantidade_atual >= 1
 order by e.local_id, e.id
 limit 2;

create temp table _r as
select fn_registra_saida_requisicao(
  p_estoque_id := (select estoque_id from _dois order by local_id limit 1),
  p_quantidade := 1, p_quantidade_solicitada := 1) as j;

select fn_registra_saida_requisicao(
  p_estoque_id    := (select estoque_id from _dois order by local_id desc limit 1),
  p_quantidade    := 1,
  p_quantidade_solicitada := 1,
  p_requisicao_id := ((select j from _r)->>'requisicao_id')::int);

select
  (select count(*) from _dois)                                        as locais_no_teste,
  (select count(distinct local_id) from vw_requisicao_itens
    where requisicao_id = ((select j from _r)->>'requisicao_id')::int) as locais_na_requisicao,
  (select itens from vw_requisicoes
    where id = ((select j from _r)->>'requisicao_id')::int)            as itens;

rollback;
```

Esperado: `2 | 2 | 2`. Se `locais_no_teste` vier 1, o banco só tem um local com
saldo e o teste não prova nada — cadastre saldo em um segundo local antes.

### 5. Excluir a movimentação deixa o item em pé

O admin pode excluir movimentação desde a v1.0.0. O item precisa sobreviver com
entregue zero.

```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"SEU_UUID_ADMIN","role":"authenticated"}';

create temp table _r as
select fn_registra_saida_requisicao(
  p_estoque_id := (select e.id from estoques e
                    where e.quantidade_atual >= 1
                      and fn_pode_editar_local(e.local_id) limit 1),
  p_quantidade := 1, p_quantidade_solicitada := 4) as j;

delete from movimentacoes
 where id = ((select j from _r)->>'movimentacao_id')::int;

select
  (select count(*) from requisicao_itens
    where id = ((select j from _r)->>'requisicao_item_id')::int)       as item_sobreviveu,
  (select quantidade_solicitada from vw_requisicao_itens
    where id = ((select j from _r)->>'requisicao_item_id')::int)       as solicitada,
  (select quantidade_entregue from vw_requisicao_itens
    where id = ((select j from _r)->>'requisicao_item_id')::int)       as entregue;

rollback;
```

Esperado: `1 | 4 | 0`. Foi pedido e não foi entregue.

---

## Rollback da migração

Se precisar desfazer tudo:

```sql
begin;

drop view if exists vw_requisicao_itens;
drop view if exists vw_requisicoes;
drop function if exists fn_registra_saida_requisicao(int, numeric, numeric, int, timestamptz, int, uuid, uuid);
drop trigger if exists tg_toca_requisicao_entrega on movimentacoes;
drop trigger if exists tg_toca_requisicao_item on requisicao_itens;
drop function if exists fn_toca_requisicao();
alter table movimentacoes drop column if exists requisicao_item_id;
drop table if exists requisicao_itens;
drop table if exists requisicoes;

commit;
```

Perde as requisições gravadas, mas nenhuma movimentação: o histórico de estoque
é independente, o vínculo mora na coluna que está sendo removida.

---

## Nota — por que o "só admin" não está no banco

Combinamos começar liberando o fluxo apenas para administradores. As policies
acima, porém, já estão na forma final: cabeçalho para qualquer usuário ativo,
itens por local. Quem trava o fluxo em admin é a tela.

O motivo é o custo de mudar de ideia. RLS existe para proteger dado de local
alheio, e isso as policies fazem. "Só admin por enquanto" não é proteção de
dado, é decisão de implantação — e decisão de implantação que vira policy custa
uma migração 09 nos três bancos no dia em que você liberar para os gerentes. Na
tela, custa apagar uma condição.

Efeito colateral honesto: um gerente que chamasse a API diretamente conseguiria
criar requisição antes da liberação. Ele já pode criar movimentação no local
dele, então nada de novo fica ao alcance dele — só o número da requisição.

Se preferir travar no banco também, é trocar as duas policies de insert por
`fn_is_admin()`: a migração que as devolve ao desenho acima já está escrita
aqui, basta copiar da Parte 2.
