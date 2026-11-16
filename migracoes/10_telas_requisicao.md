# Migração 10 — Telas dedicadas de requisição

Rode no **banco de testes** primeiro. As quatro partes são independentes, na ordem em que
estão, e cada uma é um bloco único: copie a parte inteira de uma vez. Não divida um bloco
em vários "Run" — o SQL Editor abre uma conexão nova por execução, e um `begin;` sozinho
fica órfão e volta atrás (foi o que aconteceu na migração 05).

O que esta migração prepara é a tela de pedido: a requisição passa a existir **antes** da
entrega. Quatro coisas:

- **Três colunas em `requisicoes`** — `data` (o pedido pode ser datado à mão),
  `fechada_em` (encerrar à mão o pedido que não será mais atendido) e `observacoes` (a
  nota do pedido, inclusive o porquê de um excedente).
- **Policies de `update`/`delete` por local**, em vez de só admin, para o gerente corrigir
  o próprio pedido — com dois triggers de proteção por coluna, porque RLS é por linha.
- **`vw_requisicoes`** ganha as colunas novas, o total entregue e a contagem de itens
  pendentes, que é o que separa aberta de concluída sem guardar status.
- **`fn_registra_saida_requisicao`** passa a datar o cabeçalho pela data da movimentação
  que o criou.

**Atenção, uma parte escreve em dado existente:** a Parte 1 preenche `data` com o
`criado_em` de cada requisição que já existe. É o único `update` em linha antiga de toda a
migração, não toca em saldo nem em movimentação, e sem ele as requisições antigas nasceriam
todas com a data do dia em que você rodou a migração.

Os testes **não criam requisição nem movimentação** e por isso não queimam ids de
sequence. Os que escrevem rodam em `begin/rollback`.

---

## Parte 1 — data, encerramento e observação no cabeçalho

```sql
begin;

-- -----------------------------------------------------------------
-- data x criado_em. O comentário antigo da tabela dizia que não existia
-- coluna "data" porque criado_em já era a data da requisição, e previa esta
-- migração: "quando a tela dedicada precisar de data escolhida à mão, aí sim
-- entra uma coluna própria — o criado_em é auditoria e não deve ser
-- reescrito". É exatamente isso que acontece aqui, e é o mesmo par que
-- movimentacoes já tem (data = evento real, criado_em = auditoria).
--
-- fechada_em existe porque "pedi 10, só tinha 8, está encerrada assim" não sai
-- de soma nenhuma: é decisão de alguém, informação nova. O resto do estado
-- continua derivado — não entra coluna de status, e "parcial ou total" sai das
-- somas dos itens, que se corrigem sozinhas quando alguém exclui uma
-- movimentação. Foi o que estoques.quantidade_atual ensinou.
--
-- observacoes é do CABEÇALHO, não da linha. O excedente nasce na entrega: duas
-- entregas do mesmo item, uma delas com sobra, disputariam um campo por linha,
-- e a segunda apagaria a nota da primeira.
-- -----------------------------------------------------------------
alter table requisicoes add column data        timestamptz;
alter table requisicoes add column fechada_em  timestamptz;
alter table requisicoes add column observacoes text;

-- O backfill vem ANTES do not null, e é o único update em linha antiga desta
-- migração. Se a coluna nascesse com `not null default now()`, toda requisição
-- antiga ficaria datada do dia em que a migração rodou.
update requisicoes set data = criado_em where data is null;

alter table requisicoes alter column data set not null;
alter table requisicoes alter column data set default now();

comment on column requisicoes.data          is 'Data/hora do evento real do pedido, escolhida na tela. Pode diferir de criado_em. Ordena a lista de requisições.';
comment on column requisicoes.fechada_em    is 'Quando a requisição foi encerrada à mão. Nula = aberta. Encerrar é decisão, não soma: serve para o pedido que não será mais atendido sair da lista de pendências.';
comment on column requisicoes.observacoes   is 'Nota livre do pedido — por que foi entregue mais do que o solicitado, ou qualquer outra situação. É do cabeçalho, não da linha: o excedente nasce na entrega, e duas entregas do mesmo item disputariam um campo por linha.';
comment on column requisicoes.criado_em     is 'Auditoria: quando a linha foi criada. A data do pedido é a coluna data, que pode ser escolhida à mão.';
comment on column requisicoes.atualizado_em is 'Atualizada por trigger a cada item ou entrega, e pelo tg_protege_requisicao em qualquer update do cabeçalho. Ordena o modal de requisições existentes.';

commit;
```

Não precisa de grant: `requisicoes` já recebeu `select, insert, update, delete` para
`authenticated` na migração 08, e grant é por tabela, não por coluna. Quem pode mexer em
quais linhas é a Parte 2.

Nos bancos migrados as três colunas ficam **no fim** da tabela; no
`estoque_schema_normalizado.sql` elas aparecem antes de `criado_em`, por legibilidade. A
ordem física não é lida por ninguém — views e PostgREST usam nome —, então a diferença é
cosmética e está anotada no schema.

---

## Parte 2 — o gerente edita o próprio pedido

```sql
begin;

-- -----------------------------------------------------------------
-- O problema conhecido: RLS é por LINHA, não por coluna. Liberar update em
-- requisicao_itens para o gerente liberaria junto a troca de local_id, isto é,
-- mover um item para um local que ele não gerencia.
--
-- O projeto já resolveu isso de duas formas: função security definer
-- (fn_define_estoque_minimo) e trigger de negação por coluna
-- (tg_protege_perfil). Aqui é o trigger, porque a tela precisa de update E
-- delete, e amanhã de edição em lote: uma função por operação não escala, e
-- cada função nova é mais uma superfície para esquecer uma checagem. O trigger
-- vale para qualquer caminho, inclusive chamada direta à API.
-- -----------------------------------------------------------------
create or replace function fn_protege_requisicao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() nulo é SQL Editor ou service role — contexto administrativo,
  -- igual ao fn_protege_perfil.
  if auth.uid() is not null and not fn_is_admin() then
    if NEW.digitado_por is distinct from OLD.digitado_por then
      raise exception 'Apenas administradores podem trocar quem digitou a requisição.'
        using errcode = '42501';
    end if;
    if NEW.entregue_por is distinct from OLD.entregue_por then
      raise exception 'Apenas administradores podem trocar quem entregou a requisição.'
        using errcode = '42501';
    end if;
    if NEW.criado_em is distinct from OLD.criado_em then
      raise exception 'criado_em é auditoria e não pode ser alterado.'
        using errcode = '42501';
    end if;
  end if;
  NEW.atualizado_em := now();
  return NEW;
end;
$$;

drop trigger if exists tg_protege_requisicao on requisicoes;

create trigger tg_protege_requisicao
before update on requisicoes
for each row execute function fn_protege_requisicao();

comment on function fn_protege_requisicao() is
  'Impede que não-admin troque os responsáveis ou o criado_em da requisição, e mantém atualizado_em. Espelha o fn_protege_perfil.';

-- -----------------------------------------------------------------
-- O trigger dos itens faz duas coisas, e a segunda é a que importa para a
-- limpeza do pedido: movimentacoes.requisicao_item_id é `on delete set null`,
-- de propósito, para que apagar um item não apague histórico de estoque. O
-- efeito colateral é que o vínculo da entrega com a requisição desaparece
-- calado — a coluna Req do Histórico volta a travessão para aquela saída.
--
-- Para não-admin isso fica barrado. A limpeza certa, quando a entrega foi
-- errada, é excluir a movimentação no Histórico primeiro (o fn_reverte_estoque
-- devolve o saldo) e só então o item, que aí não tem mais entrega nenhuma.
-- Admin continua podendo — a tela é que vai avisar, com o número de entregas,
-- antes de deixar.
-- -----------------------------------------------------------------
create or replace function fn_protege_requisicao_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entregas int;
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and not fn_is_admin() then
      select count(*) into v_entregas
        from movimentacoes where requisicao_item_id = OLD.id;

      if v_entregas > 0 then
        raise exception
          'Este item já tem % entrega(s) registrada(s). Excluí-lo faria essas movimentações perderem o vínculo com a requisição. Exclua a movimentação no Histórico primeiro, ou peça a um administrador.',
          v_entregas
          using errcode = '42501';
      end if;
    end if;
    return OLD;
  end if;

  if auth.uid() is not null and not fn_is_admin() then
    if NEW.requisicao_id is distinct from OLD.requisicao_id then
      raise exception 'Apenas administradores podem mover um item para outra requisição.'
        using errcode = '42501';
    end if;
    if NEW.apresentacao_id is distinct from OLD.apresentacao_id then
      raise exception 'Apenas administradores podem trocar o produto de um item. Exclua a linha e inclua a correta.'
        using errcode = '42501';
    end if;
    if NEW.local_id is distinct from OLD.local_id then
      raise exception 'Apenas administradores podem trocar o local de um item.'
        using errcode = '42501';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists tg_protege_requisicao_item on requisicao_itens;

create trigger tg_protege_requisicao_item
before update or delete on requisicao_itens
for each row execute function fn_protege_requisicao_item();

comment on function fn_protege_requisicao_item() is
  'Impede que não-admin troque requisicao_id, apresentacao_id ou local_id de um item, e que exclua item que já tem entrega — o delete apagaria em silêncio o vínculo da movimentação com a requisição.';

-- -----------------------------------------------------------------
-- Agora as policies. Os triggers entram ANTES delas no mesmo bloco de
-- propósito: policy relaxada sem o trigger é uma janela aberta, e como é tudo
-- uma transação só, a janela não existe em nenhum instante.
-- -----------------------------------------------------------------
drop policy if exists "admin pode atualizar requisicoes" on requisicoes;
drop policy if exists "admin pode deletar requisicoes"   on requisicoes;

-- O predicado tem três braços, e cada um existe por um caso: admin; quem
-- digitou (que cobre o cabeçalho recém-criado, ainda sem item, onde o braço de
-- baixo não teria em que se apoiar); e quem gerencia o local de algum item
-- (que cobre a requisição cruzando locais, sem inventar dono para ela).
create policy "gestores podem atualizar requisicoes"
  on requisicoes for update to authenticated
  using (
    fn_is_ativo() and (
      fn_is_admin()
      or digitado_por = auth.uid()
      or exists (
        select 1 from requisicao_itens i
         where i.requisicao_id = requisicoes.id
           and fn_pode_editar_local(i.local_id)
      )
    )
  );

-- Excluir o cabeçalho é mais restrito que editá-lo, e por um motivo concreto:
-- requisicao_itens tem on delete cascade, e CASCADE não passa por RLS. Sem o
-- "not exists" abaixo, o gerente da Cozinha apagaria, junto com a requisição,
-- os itens do Almoxarifado que ele nem pode ver.
create policy "gestores podem deletar a propria requisicao"
  on requisicoes for delete to authenticated
  using (
    fn_is_ativo() and (
      fn_is_admin()
      or (
        digitado_por = auth.uid()
        and not exists (
          select 1 from requisicao_itens i
           where i.requisicao_id = requisicoes.id
             and not fn_pode_editar_local(i.local_id)
        )
      )
    )
  );

drop policy if exists "admin pode atualizar itens de requisicao" on requisicao_itens;
drop policy if exists "admin pode deletar itens de requisicao"   on requisicao_itens;

-- Mesma régua do insert: quem gerencia o local do item mexe no item. O
-- with check existe para o update não ser porta lateral para mover a linha
-- para um local alheio — o trigger já barra a troca de local_id para
-- não-admin, e o with check fecha o caso do admin também.
create policy "gestores podem atualizar itens de requisicao"
  on requisicao_itens for update to authenticated
  using (fn_pode_editar_local(local_id))
  with check (fn_pode_editar_local(local_id));

create policy "gestores podem deletar itens de requisicao"
  on requisicao_itens for delete to authenticated
  using (fn_pode_editar_local(local_id));

commit;
```

Uma consequência que vale ter em mente: o `tg_protege_requisicao_item` dispara **também no
cascade**. Se um gerente excluir a própria requisição e algum item dela já tiver entrega, o
delete inteiro é recusado — o que é o resultado certo, porque o cascade apagaria todos
aqueles vínculos de uma vez.

---

## Parte 3 — a view com data, encerramento e progresso

```sql
begin;

-- -----------------------------------------------------------------
-- As colunas novas entram no FIM, depois de total_solicitado, e isso não é
-- estética: create or replace view não deixa mudar nome, tipo nem ORDEM das
-- colunas existentes — só acrescentar no fim. Pôr no meio exigiria drop +
-- create, e o drop levaria o grant embora (o 42501 da migração 08).
--
-- O with (security_invoker = on) vai DENTRO do create, e não num alter view
-- depois: create or replace view sem cláusula with substitui o conjunto de
-- opções pelo conjunto VAZIO. Foi o bug da migração 09 — a view ficou com
-- reloptions NULL, rodando com a permissão do dono e ignorando o RLS por
-- local. O grant sobrevive ao replace (mora em pg_class.relacl); a opção não.
--
-- As somas respeitam o RLS, porque a view é security_invoker. Então o gerente
-- da Cozinha vê os totais da parte que é dele numa requisição que cruza
-- locais — coerente com a contagem `itens`, que já era assim desde a 08.
-- -----------------------------------------------------------------
create or replace view vw_requisicoes
  with (security_invoker = on)
as
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
    where i.requisicao_id = r.id)                        as total_solicitado,
  -- Daqui para baixo, colunas da migração 10.
  r.data,
  r.fechada_em,
  r.observacoes,
  (select coalesce(sum(m.quantidade), 0)
     from requisicao_itens i
     join movimentacoes    m on m.requisicao_item_id = i.id
    where i.requisicao_id = r.id)                        as total_entregue,
  -- Itens que ainda devem algo. É o que separa aberta de concluída sem
  -- guardar status: pendente é entregue < solicitada, e o número se corrige
  -- sozinho quando uma movimentação é excluída. A lista filtra aberta com
  -- fechada_em is null and itens_pendentes > 0.
  (select count(*)
     from requisicao_itens i
    where i.requisicao_id = r.id
      and i.quantidade_solicitada > coalesce(
            (select sum(m.quantidade)
               from movimentacoes m
              where m.requisicao_item_id = i.id), 0))     as itens_pendentes
from requisicoes r
left join perfis pd on pd.id = r.digitado_por
left join perfis pe on pe.id = r.entregue_por
order by r.atualizado_em desc;

comment on view vw_requisicoes is
  'Cabeçalho das requisições com responsáveis, data, encerramento, observação e os totais solicitado e entregue. As somas e a contagem de itens respeitam o RLS por local, então o gerente vê os totais da parte que é dele. Ordenada por última alteração, para o modal de requisição existente.';

commit;
```

A ordenação continua por `atualizado_em`, e **não** pela coluna `data` nova, porque é dela
que o modal de "requisição existente" depende — ele mostra o que foi mexido por último. A
lista de requisições pede `data desc` na própria consulta, que é o lugar certo para uma
ordenação que é da tela.

---

## Parte 4 — a RPC data o cabeçalho pela movimentação

```sql
begin;

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

    -- A data do cabeçalho acompanha a da movimentação que o criou: lançar uma
    -- saída de ontem cria uma requisição de ontem, não de hoje. Sem isto a
    -- coluna data mentiria justamente no caminho que cria quase toda
    -- requisição.
    insert into requisicoes (digitado_por, entregue_por, data)
    values (v_digitado, v_entregue, coalesce(p_data, now()))
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

É a única mudança funcional da migração, e é de uma linha: o `insert into requisicoes`
passa a receber `data`. Sem ela, lançar uma saída de ontem criaria uma requisição datada de
hoje — a coluna nova mentiria justamente no caminho que cria quase toda requisição do
sistema. O resto da função é idêntico ao que já estava rodando.

---

## Testes

Rode no banco de testes. Nenhum cria requisição ou movimentação; os que escrevem rodam em
`begin/rollback`.

Todos devolvem **tabela**. Nenhum depende de `raise notice`: o painel de resultado do SQL
Editor não mostra notice, então teste que só emite notice parece não ter rodado. Os testes 3
e 4 nasceram assim e foram reescritos.

### 1. Estrutura — um veredito só

```sql
select
  (select count(*) from information_schema.columns
    where table_name = 'requisicoes'
      and column_name in ('data', 'fechada_em', 'observacoes'))                  as col_novas,
  (select count(*) from requisicoes where data is distinct from criado_em)       as data_divergente,
  (select count(*) from pg_policies
    where policyname in ('gestores podem atualizar requisicoes',
                         'gestores podem deletar a propria requisicao',
                         'gestores podem atualizar itens de requisicao',
                         'gestores podem deletar itens de requisicao'))          as policies_novas,
  (select count(*) from pg_policies
    where policyname like 'admin pode%requisic%')                                as policies_antigas,
  (select count(*) from pg_trigger
    where tgname in ('tg_protege_requisicao', 'tg_protege_requisicao_item'))     as triggers_novos,
  (select count(*) from information_schema.columns
    where table_name = 'vw_requisicoes'
      and column_name in ('data', 'fechada_em', 'observacoes',
                          'total_entregue', 'itens_pendentes'))                  as col_view,
  (select reloptions::text from pg_class where relname = 'vw_requisicoes')       as opcoes_view;
```

**Esperado:** `3 | 0 | 4 | 0 | 2 | 5 | {security_invoker=true}`

- `data_divergente` em zero prova que o backfill pegou todas as linhas. Ele só vale **logo
  depois da migração**: assim que alguém editar a data de um pedido na tela, esse número
  passa a ser maior que zero, e com razão.
- `policies_antigas` em zero prova que as quatro de admin saíram. Se vier 4, os `drop
  policy` não rodaram e você ficou com duas regras concorrendo — no Postgres policies de
  um mesmo comando se somam com OR, então a mais permissiva venceria.
- `opcoes_view` **NULL é falha grave**, não detalhe: a view ficaria rodando com a permissão
  do dono e qualquer usuário autenticado veria requisição de todos os locais. Conserta com
  `alter view vw_requisicoes set (security_invoker = on);`.

### 2. O cabeçalho aceita nota e encerramento

```sql
begin;

update requisicoes
   set observacoes = 'teste da migracao 10',
       fechada_em  = now()
 where id = (select id from requisicoes order by id limit 1);

select id,
       observacoes,
       fechada_em is not null as fechada,
       atualizado_em >= now() - interval '1 minute' as atualizado_em_mexeu
  from requisicoes
 order by id limit 1;

rollback;
```

**Esperado:** a nota aparece, `fechada` = `true` e `atualizado_em_mexeu` = `true` — este
último é o `tg_protege_requisicao` fazendo a outra metade do trabalho dele.

### 3. O trigger barra troca de responsável e de produto para não-admin

Este roda como um usuário de verdade, com RLS, no molde do teste de RLS da migração 07. Ele
não espera exceção: espera que o valor **não mude** — porque, dependendo de qual usuário o
banco escolher, a policy pode recusar a linha antes de o trigger ser chamado, e aí o update
afeta zero linhas em silêncio. Os dois desfechos são aprovação; o que reprova é o valor ter
mudado.

O veredito sai como **tabela**, não em Notices. A primeira versão deste teste usava
`raise notice` e o painel de resultado do SQL Editor não mostra notice nenhum: o teste
rodava e parecia não ter feito nada.

```sql
begin;

drop table if exists _verdito;
create temp table _verdito (etapa text, resultado text);

do $$
declare
  v_uid       uuid;
  v_outro     uuid;
  v_outro_loc int;
  v_req       int;
  v_item      int;
  v_entregue0 uuid;
  v_local0    int;
  v_entregue1 uuid;
  v_local1    int;
  v_linhas    int;
  v_msg_cab   text;
  v_msg_item  text;
begin
  select id into v_uid  from perfis where ativo and not is_admin order by criado_em limit 1;
  select id into v_req  from requisicoes      order by id limit 1;
  select id into v_item from requisicao_itens order by id limit 1;

  if v_uid is null or v_req is null or v_item is null then
    insert into _verdito values
      ('preparo', 'PULADO: precisa de um usuario nao-admin ativo, uma requisicao e um item');
    return;
  end if;

  select entregue_por into v_entregue0 from requisicoes      where id = v_req;
  select local_id     into v_local0    from requisicao_itens where id = v_item;

  -- O alvo tem que ser DIFERENTE do valor atual, senao o `is distinct from` do
  -- trigger nao dispara e o teste passaria sem ter testado nada.
  select id into v_outro     from perfis where id is distinct from v_entregue0 order by criado_em limit 1;
  select id into v_outro_loc from locais where id is distinct from v_local0    order by id        limit 1;

  if v_outro is null or v_outro_loc is null then
    insert into _verdito values
      ('preparo', 'PULADO: precisa de dois perfis e de dois locais cadastrados');
    return;
  end if;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  -- As mensagens vao para variaveis, e nao direto para a _verdito: enquanto o
  -- role e authenticated, inserir na temp table (que e do postgres) seria
  -- recusado por falta de privilegio, e o erro apareceria como se fosse o
  -- resultado do teste.
  begin
    update requisicoes set entregue_por = v_outro where id = v_req;
    get diagnostics v_linhas = row_count;
    v_msg_cab := format('sem erro, %s linha(s) afetada(s)', v_linhas);
  exception when others then
    v_msg_cab := 'barrado: ' || sqlerrm;
  end;

  begin
    update requisicao_itens set local_id = v_outro_loc where id = v_item;
    get diagnostics v_linhas = row_count;
    v_msg_item := format('sem erro, %s linha(s) afetada(s)', v_linhas);
  exception when others then
    v_msg_item := 'barrado: ' || sqlerrm;
  end;

  -- Volta ao contexto administrativo para LER. Limpar o role nao basta: se as
  -- claims ficarem no lugar, auth.uid() continua devolvendo o usuario do teste
  -- e tudo daqui para baixo roda com o RLS dele. Foi exatamente isso que
  -- derrubou o teste 4 na primeira tentativa.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);

  select entregue_por into v_entregue1 from requisicoes      where id = v_req;
  select local_id     into v_local1    from requisicao_itens where id = v_item;

  insert into _verdito values
    ('usuario do teste',       v_uid::text),
    ('contexto da leitura',    current_user || ', auth.uid() = '
                               || coalesce(auth.uid()::text, 'nulo')),
    ('cabecalho: o que houve', v_msg_cab),
    ('item: o que houve',      v_msg_item),
    ('entregue_por mudou?',
      case when v_entregue1 is distinct from v_entregue0
           then 'FALHOU - mudou' else 'OK - continua como estava' end),
    ('local_id mudou?',
      case when v_local1 is distinct from v_local0
           then 'FALHOU - mudou' else 'OK - continua como estava' end);
end $$;

select * from _verdito;

rollback;
```

**Esperado:** seis linhas. `contexto da leitura` tem que trazer `auth.uid() = nulo` — se
trouxer um uuid, as claims não foram limpas e todo o resto do teste leu com o RLS do usuário
de teste. Em `cabecalho: o que houve` e `item: o que houve`, ou
`barrado: Apenas administradores podem...` (o trigger disparou) ou `sem erro, 0 linha(s)
afetada(s)` (a policy recusou a linha antes). As duas últimas linhas têm que dizer
`OK - continua como estava`.

Qualquer `FALHOU` significa que o trigger da Parte 2 não entrou. E se vier a linha única de
`PULADO`, o teste não testou nada: o banco de testes não tem usuário não-admin ativo, ou
não tem dois locais. Vale criar um usuário comum ali — é o mesmo que falta para conferir
RLS de qualquer coisa nova.

### 4. Item com entrega não pode ser excluído por não-admin

Duas metades: a proibição para o gerente, e o que acontece quando o **admin** exclui — que é
exatamente o que a tela vai ter que avisar antes de deixar.

A segunda metade roda como um admin de verdade, não pelo contexto do SQL Editor. E as duas
trocam `role` **e** `request.jwt.claims`: limpar só o role deixa `auth.uid()` devolvendo o
usuário anterior, e o trigger continua vendo um não-admin. Foi assim que a primeira versão
deste teste abortou no meio — com a mensagem do trigger, que é a prova de que ele funciona,
mas no lugar errado.

```sql
begin;

drop table if exists _verdito;
create temp table _verdito (etapa text, resultado text);

do $$
declare
  v_uid      uuid;
  v_admin    uuid;
  v_item     int;
  v_entregas int;
  v_existe   int;
  v_linhas   int;
  v_orfas    int;
  v_msg      text;
  v_msg_adm  text;
begin
  select ri.id into v_item
    from requisicao_itens ri
    join movimentacoes m on m.requisicao_item_id = ri.id
   group by ri.id
   order by ri.id limit 1;

  select id into v_uid   from perfis where ativo and not is_admin order by criado_em limit 1;
  select id into v_admin from perfis where ativo and     is_admin order by criado_em limit 1;

  if v_item is null then
    insert into _verdito values
      ('preparo', 'PULADO: nenhum item de requisicao tem entrega neste banco');
    return;
  end if;
  if v_uid is null then
    insert into _verdito values ('preparo', 'PULADO: nenhum usuario nao-admin ativo');
    return;
  end if;

  select count(*) into v_entregas from movimentacoes where requisicao_item_id = v_item;

  -- 1. como o gerente
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  begin
    delete from requisicao_itens where id = v_item;
    get diagnostics v_linhas = row_count;
    v_msg := format('sem erro, %s linha(s) excluida(s)', v_linhas);
  exception when others then
    v_msg := 'barrado: ' || sqlerrm;
  end;

  -- 2. de volta ao contexto administrativo, so para ler. As claims TAMBEM
  --    saem: sem isso auth.uid() continua sendo o gerente.
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);

  select count(*) into v_existe from requisicao_itens where id = v_item;

  insert into _verdito values
    ('item escolhido',         format('id %s, com %s entrega(s)', v_item, v_entregas)),
    ('contexto da leitura',    current_user || ', auth.uid() = '
                               || coalesce(auth.uid()::text, 'nulo')),
    ('gerente: o que houve',   v_msg),
    ('item sobreviveu?',
      case when v_existe = 1 then 'OK - continua la' else 'FALHOU - foi excluido' end);

  -- 3. agora como admin de verdade, para ver a perda que a tela precisa avisar
  if v_existe = 1 and v_admin is not null then
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- Dentro de begin/exception, como o de cima: teste que aborta no meio nao
    -- chega a mostrar o veredito, e foi o que aconteceu aqui antes.
    begin
      delete from requisicao_itens where id = v_item;
      get diagnostics v_linhas = row_count;
      v_msg_adm := format('sem erro, %s linha(s) excluida(s)', v_linhas);
    exception when others then
      v_msg_adm := 'barrado: ' || sqlerrm;
    end;

    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claims', '', true);

    select count(*) into v_existe from requisicao_itens where id = v_item;
    select count(*) into v_orfas  from movimentacoes where requisicao_item_id is null;

    insert into _verdito values
      ('admin: o que houve', v_msg_adm),
      ('admin excluiu?',
        case when v_existe = 0
             then format('OK - item saiu; %s entrega(s) ficaram sem vinculo, e agora sao %s movimentacoes com requisicao_item_id nulo',
                         v_entregas, v_orfas)
             else 'FALHOU - nem o admin conseguiu excluir' end);
  elsif v_admin is null then
    insert into _verdito values
      ('admin excluiu?', 'PULADO: nenhum usuario admin ativo no banco');
  end if;
end $$;

select * from _verdito;

rollback;
```

**Esperado:** seis linhas.

| etapa | o que tem que vir |
|---|---|
| `item escolhido` | o id e o número de entregas |
| `contexto da leitura` | `auth.uid() = nulo` — se vier um uuid, as claims não saíram |
| `gerente: o que houve` | `barrado: Este item já tem N entrega(s)...` |
| `item sobreviveu?` | `OK - continua la` |
| `admin: o que houve` | `sem erro, 1 linha(s) excluida(s)` |
| `admin excluiu?` | `OK - item saiu; ...` |

Se `gerente: o que houve` vier `sem erro, 0 linha(s) excluida(s)`, foi a policy que recusou
a linha antes do trigger. Também é aprovação, mas significa que o usuário sorteado não
gerencia o local daquele item, e o trigger segue sem prova por este caminho.

A última linha é a que vale ler com atenção: ela mostra quantas movimentações ficaram com
`requisicao_item_id` nulo depois da exclusão pelo admin. É a perda que a tela precisa avisar
— aquelas saídas continuam no Histórico, com o saldo correto, mas sem o `#N` da requisição.
E nada disso fica no banco: o `rollback` desfaz as duas exclusões.

### 5. A view soma certo

```sql
select
  (select count(*) from vw_requisicoes)                                  as linhas_view,
  (select count(*) from requisicoes)                                     as linhas_tabela,
  (select coalesce(sum(total_entregue), 0) from vw_requisicoes)          as entregue_view,
  (select coalesce(sum(m.quantidade), 0) from movimentacoes m
    where m.requisicao_item_id is not null)                              as entregue_direto;
```

**Esperado:** `linhas_view` igual a `linhas_tabela` — se a view tiver mais linhas, alguma
subconsulta virou join e multiplicou requisição. E `entregue_view` igual a
`entregue_direto`: rodando no SQL Editor não há RLS no caminho, então os dois números são
calculados sobre o mesmo conjunto e têm que fechar.

### 6. Conferir pelo olho

```sql
select id, data, fechada_em, itens, itens_pendentes,
       total_solicitado, total_entregue, observacoes
  from vw_requisicoes
 order by data desc
 limit 10;
```

**Esperado:** `data` igual ao `criado_em` de cada uma (é o backfill), `fechada_em` e
`observacoes` nulos em todas, e `itens_pendentes` em zero nas requisições que você já
entregou inteiras. Requisição com `itens_pendentes > 0` e `total_entregue > 0` é entrega
parcial — é exatamente o estado que a lista nova vai mostrar como "8 de 10".

---

## Rollback da migração

```sql
begin;

drop trigger if exists tg_protege_requisicao      on requisicoes;
drop trigger if exists tg_protege_requisicao_item on requisicao_itens;
drop function if exists fn_protege_requisicao();
drop function if exists fn_protege_requisicao_item();

drop policy if exists "gestores podem atualizar requisicoes"        on requisicoes;
drop policy if exists "gestores podem deletar a propria requisicao" on requisicoes;

create policy "admin pode atualizar requisicoes"
  on requisicoes for update to authenticated
  using (fn_is_admin());

create policy "admin pode deletar requisicoes"
  on requisicoes for delete to authenticated
  using (fn_is_admin());

drop policy if exists "gestores podem atualizar itens de requisicao" on requisicao_itens;
drop policy if exists "gestores podem deletar itens de requisicao"   on requisicao_itens;

create policy "admin pode atualizar itens de requisicao"
  on requisicao_itens for update to authenticated
  using (fn_is_admin());

create policy "admin pode deletar itens de requisicao"
  on requisicao_itens for delete to authenticated
  using (fn_is_admin());

-- A view precisa de drop + create: replace acrescenta coluna no fim, mas não
-- REMOVE coluna nenhuma. E o drop leva o grant embora, por isso ele volta
-- explícito no fim do bloco.
drop view if exists vw_requisicoes;

create view vw_requisicoes
  with (security_invoker = on)
as
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

grant select on public.vw_requisicoes to authenticated;

alter table requisicoes drop column if exists observacoes;
alter table requisicoes drop column if exists fechada_em;
alter table requisicoes drop column if exists data;

commit;
```

**Falta uma coisa neste bloco, de propósito:** a `fn_registra_saida_requisicao` da Parte 4.
Reverter a função exigiria repetir as noventa linhas dela aqui, e duas cópias da mesma
função em arquivos diferentes é como nascem as divergências. Pegue a versão anterior do
commit que trouxe esta migração:

```bash
git show <commit-da-migracao-10>^:estoque_schema_normalizado.sql | grep -n "fn_registra_saida_requisicao" 
```

E rode o bloco da função de lá **antes** de derrubar a coluna `data`. O plpgsql não valida
o corpo na criação, então a função não quebra no `create`: ela quebra na primeira saída com
requisição que alguém tentar lançar, com erro de coluna inexistente.

O resto não perde dado: `observacoes` e `fechada_em` nascem nulas e só existiriam com o que
a tela nova gravou, e `data` volta a ser `criado_em`, de onde veio.

E, como sempre: se reverter o banco, reverta o código junto. A lista de requisições lê
`data`, `fechada_em` e `itens_pendentes`.

---

## Nota — o que ficou de fora, e por quê

O plano das telas (`REQUISICOES_TELAS_PLANO.md`) tinha um sétimo item que **não** está
nesta migração: deixar `requisicao_itens.quantidade_solicitada` aceitar nulo, para
distinguir "pedido" de "entregue por fora do pedido".

A decisão foi não fazer, e é do Matheus, em 11/11/2026, depois de ver os três casos em que
isso acontece:

- **Item pedido no balcão durante a entrega** — "é prático, seguimos assim".
- **Erro de apresentação** (o pedido tem Arroz 5kg e o operador lança Arroz 1kg) — "é algo
  chato mas no final é visto que foi entregue; o gerente ou adm pode excluir depois para
  ficar limpo".
- **Entrega de outro local** — "esse comportamento é bom, pois permite ver que o produto
  foi pedido em um local e talvez por falta foi retirado de outro".

Então a RPC continua criando o item com `quantidade_solicitada = quantidade entregue`, e o
pedido continua não sabendo distinguir uma linha que nasceu de uma entrega. O preço disso é
só de leitura, e está aceito.

Para ver o que isso significa na prática, o caso 2: pedido #42 montado com Arroz 5kg — 10, e
o operador entrega clicando em Arroz 1kg.

| produto | solicitada | entregue |
|---|---|---|
| Arroz 5kg | 10 | 0 |
| Arroz 1kg | **10** | 10 |

O 10 em negrito é invenção da RPC — ninguém pediu Arroz 1kg. Com o nulo, aquela linha
ficaria com `solicitada = null` e a tela mostraria duas seções, "o pedido" e "entregue sem
constar no pedido". Sem ele, as duas linhas são indistinguíveis. **Em troca, nenhuma
constraint existente foi alterada por esta migração**, o que não é pouco: era o único item
do plano que mexia em regra de dado já gravado.

Duas consequências práticas, para quem for codar as telas:

1. **Não existe seção de "extras"** na tela da requisição. Todos os itens aparecem numa
   lista só, porque o banco não sabe separá-los.
2. **A limpeza do caso do erro de apresentação é excluir a linha que NÃO tem entrega** — a
   do Arroz 5kg, que ficou em `entregue 0`. Essa exclusão não perde nada: não há
   movimentação apontando para ela. Sobra a linha de Arroz 1kg com solicitado 10 e entregue
   10, que é o que de fato aconteceu. Excluir a linha *entregue* seria o contrário: é o que
   o `tg_protege_requisicao_item` barra para não-admin.

### Se um dia a distinção virar necessária

Ela pode ser **derivada**, sem coluna nova e sem mexer em constraint. O mecanismo:

`now()` no Postgres é `transaction_timestamp()` — congela no início da transação e devolve o
mesmo valor até o fim dela. Não é o relógio; para o relógio existe o `clock_timestamp()`.
Como `requisicao_itens.criado_em` e `movimentacoes.criado_em` são os dois `default now()`, e
a `fn_registra_saida_requisicao` insere o item e a movimentação **na mesma transação**, os
dois nascem com timestamps idênticos, no microssegundo. Um item criado pela tela de pedido,
ao contrário, nasce numa transação anterior — a entrega vem depois, outro dia até.

Então "nasceu de uma entrega" é isto, numa view:

```sql
exists (
  select 1 from movimentacoes m
   where m.requisicao_item_id = i.id
     and m.criado_em = i.criado_em
) as nasceu_da_entrega
```

É igualdade exata, não janela de tolerância — e é por isso que funciona.

Os limites, para não vender mais do que é: se alguém **excluir a movimentação que criou o
item**, o marcador deixa de encontrar par e a linha volta a parecer pedida. E ele passa a
errar no dia em que algum caminho novo criar item de pedido e entrega na mesma transação —
o que hoje não existe, mas é o tipo de coisa que muda sem ninguém lembrar deste parágrafo.
Se for para valer de verdade, aí a coluna nula é mais honesta que a dedução.
