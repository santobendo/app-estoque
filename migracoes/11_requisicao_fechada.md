# Migração 11 — requisição encerrada não recebe mais nada

Rode no **banco de testes** primeiro, e depois da 10 — ela depende da coluna `fechada_em`,
que nasceu lá. A parte única é um bloco só: copie inteiro, não divida em vários "Run" (o
SQL Editor abre conexão nova por execução, e um `begin;` sozinho fica órfão).

**O buraco que ela fecha.** Encerrar uma requisição tirava o pedido da lista de pendências,
mas não impedia nada: a RPC de entrega continuava aceitando saída contra ela, o modal de
"requisição existente" continuava oferecendo-a, e dava para adicionar item num pedido
encerrado. Ou seja, `fechada_em` era um rótulo, não um estado — e um pedido encerrado
voltava a crescer sem que ninguém percebesse, porque o selo continuava dizendo
"Encerrada".

**Três decisões que o conserto toma, e por que cada uma:**

1. **É trigger, não checagem na RPC.** A entrega tem mais de um caminho — a RPC, um
   `insert` direto em `movimentacoes` pela API, um `insert` em `requisicao_itens` pela
   tela do pedido. Checar na RPC fecharia um dos três. É o mesmo raciocínio do
   `tg_protege_requisicao_item`.
2. **Vale para admin também, e inclusive no SQL Editor.** Os triggers de proteção que já
   existem abrem exceção para `auth.uid() is null` porque são regras de *privilégio*, e o
   SQL Editor é contexto administrativo. Esta é regra de **estado do pedido**: não tem a
   ver com quem é, e um admin encerrado-por-engano tem o caminho certo a um clique —
   reabrir, lançar, encerrar de novo. Abrir exceção aqui deixaria o furo aberto justo para
   quem mais usa o sistema, já que hoje só admin entrega.
3. **Bloqueia item novo também, não só entrega.** Poder adicionar item a um pedido
   encerrado, mas não entregar nele, seria incoerente — e item sem entrega num pedido
   encerrado é exatamente o que o encerramento serve para registrar como *não atendido*.

**Não escreve em nenhuma linha existente.** São duas funções de catálogo e dois triggers;
nenhum dado é tocado, nenhuma constraint existente é alterada. Requisição encerrada que
já tenha itens e entregas continua exatamente como está — a regra vale do momento da
migração para frente, para `insert` novo.

Os testes escrevem e rodam em `begin/rollback`, então **queimam ids de sequence** —
só em banco de testes.

---

## Parte única — o trigger que recusa

```sql
begin;

-- -----------------------------------------------------------------
-- Requisição encerrada não recebe item novo nem entrega nova.
--
-- security definer de propósito, e aqui o motivo é preciso: a função lê
-- requisicao_itens para descobrir a qual requisição a movimentação pertence.
-- Se essa leitura passasse pelo RLS do usuário, um item de local alheio
-- devolveria zero linhas, v_req_id ficaria nulo, v_fechada também, e o trigger
-- LIBERARIA a entrega. Guarda que falha para o lado permissivo é pior que
-- guarda nenhuma, porque dá a impressão de proteção.
--
-- Note que não há exceção para `auth.uid() is null`, ao contrário do
-- fn_protege_requisicao_item: aquilo é regra de privilégio e o SQL Editor é
-- contexto administrativo; isto é regra de estado do pedido, e vale para
-- todo mundo. Para mexer num pedido encerrado, reabra-o — é o caminho que a
-- mensagem indica, e é um update só.
--
-- O errcode fica no default (P0001, raise_exception) em vez de 42501: não é
-- falta de permissão, e o traduzErro do front deixa P0001 passar com a
-- mensagem inteira, que é o que explica o caminho de volta.
-- -----------------------------------------------------------------
create or replace function fn_bloqueia_requisicao_fechada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req_id  int;
  v_fechada timestamptz;
  v_oque    text;
begin
  if tg_table_name = 'requisicao_itens' then
    v_req_id := NEW.requisicao_id;
    v_oque   := 'adicionar itens';
  else
    -- O trigger de movimentacoes já tem WHEN (requisicao_item_id is not null),
    -- mas a guarda fica aqui também: a função pode ser reaproveitada, e um
    -- trigger criado sem o WHEN passaria calado.
    if NEW.requisicao_item_id is null then
      return NEW;
    end if;

    select requisicao_id into v_req_id
      from requisicao_itens
     where id = NEW.requisicao_item_id;

    v_oque := 'registrar entregas';
  end if;

  select fechada_em into v_fechada from requisicoes where id = v_req_id;

  if v_fechada is not null then
    raise exception
      'A requisição % foi encerrada em %. Reabra-a para %.',
      v_req_id,
      to_char(v_fechada at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      v_oque;
  end if;

  return NEW;
end;
$$;

comment on function fn_bloqueia_requisicao_fechada() is
  'Recusa item novo e entrega nova em requisição com fechada_em preenchido. Vale para admin e para o SQL Editor: é regra de estado do pedido, não de privilégio — o caminho é reabrir.';

-- BEFORE, e não AFTER: em movimentacoes o tg_atualiza_estoque é AFTER INSERT,
-- então recusar antes garante que o saldo não é tocado nem por um instante.
create trigger tg_bloqueia_item_requisicao_fechada
  before insert on requisicao_itens
  for each row
  execute function fn_bloqueia_requisicao_fechada();

create trigger tg_bloqueia_entrega_requisicao_fechada
  before insert on movimentacoes
  for each row
  when (new.requisicao_item_id is not null)
  execute function fn_bloqueia_requisicao_fechada();

commit;
```

---

## Testes

Cada teste termina com um `select` de uma tabela temporária, pela lição da migração 10: o
painel do SQL Editor não mostra `raise notice`, então teste feito de notices roda e parece
não ter feito nada. As escritas ficam dentro de `begin/exception` para que um erro vire
linha de resultado em vez de abortar o bloco antes do veredito.

### 1. Estrutura — os dois triggers existem

```sql
select
  tgname,
  case tgrelid::regclass::text when 'requisicao_itens' then 'itens' else 'movimentacoes' end as tabela,
  case tgtype & 2 when 2 then 'BEFORE' else 'AFTER' end as momento,
  pg_get_triggerdef(oid) like '%WHEN%' as tem_when
from pg_trigger
where tgname in ('tg_bloqueia_item_requisicao_fechada',
                 'tg_bloqueia_entrega_requisicao_fechada')
order by tgname;
```

Esperado: duas linhas, as duas **BEFORE**, e `tem_when` verdadeiro só na de
`movimentacoes`.

### 2. Pedido encerrado recusa item e entrega; reaberto aceita

Este é o teste que importa. Ele monta uma requisição com um item e uma entrega de verdade,
encerra, tenta as duas operações, reabre e tenta de novo — conferindo em cada passo se o
**saldo** mudou, que é a prova de que o `BEFORE` segurou antes do `tg_atualiza_estoque`.

```sql
begin;

drop table if exists _verdito;
create temp table _verdito (etapa text, resultado text);

do $$
declare
  v_estoque   int;
  v_req       int;
  v_item      int;
  v_saldo_ini numeric;
  v_saldo     numeric;
  v_erro      text;
begin
  -- Um estoque qualquer com saldo suficiente para duas saídas de 1.
  select id, quantidade_atual into v_estoque, v_saldo_ini
    from estoques where quantidade_atual >= 2 limit 1;

  if v_estoque is null then
    insert into _verdito values ('pré-requisito',
      'FALHOU: nenhum estoque com saldo >= 2 neste banco. Lance uma entrada e rode de novo.');
    return;
  end if;

  -- Cabeçalho + item + primeira entrega, com a requisição ABERTA.
  insert into requisicoes (digitado_por, entregue_por)
  select id, id from perfis limit 1
  returning id into v_req;

  insert into requisicao_itens (requisicao_id, apresentacao_id, local_id, quantidade_solicitada)
  select v_req, e.apresentacao_id, e.local_id, 10 from estoques e where e.id = v_estoque
  returning id into v_item;

  insert into movimentacoes (estoque_id, criado_por, tipo, quantidade, requisicao_item_id)
  select v_estoque, p.id, 'saida', 1, v_item from perfis p limit 1;

  insert into _verdito values ('1. aberta aceita item e entrega', 'OK');

  -- Encerra.
  update requisicoes set fechada_em = now() where id = v_req;

  select quantidade_atual into v_saldo from estoques where id = v_estoque;

  -- (a) entrega contra o item que já existe
  begin
    insert into movimentacoes (estoque_id, criado_por, tipo, quantidade, requisicao_item_id)
    select v_estoque, p.id, 'saida', 1, v_item from perfis p limit 1;
    insert into _verdito values ('2. encerrada recusa entrega', 'FALHOU: a entrega passou');
  exception when others then
    v_erro := sqlerrm;
    insert into _verdito values ('2. encerrada recusa entrega', 'OK — ' || v_erro);
  end;

  -- O saldo não pode ter se movido: BEFORE roda antes do tg_atualiza_estoque.
  insert into _verdito
  select '3. saldo intacto apos recusa',
         case when quantidade_atual = v_saldo
              then 'OK' else 'FALHOU: saldo mudou de ' || v_saldo || ' para ' || quantidade_atual end
    from estoques where id = v_estoque;

  -- (b) item novo no pedido encerrado
  begin
    insert into requisicao_itens (requisicao_id, apresentacao_id, local_id, quantidade_solicitada)
    select v_req, e.apresentacao_id, e.local_id, 5
      from estoques e where e.id <> v_estoque limit 1;
    insert into _verdito values ('4. encerrada recusa item novo', 'FALHOU: o item entrou');
  exception when others then
    insert into _verdito values ('4. encerrada recusa item novo', 'OK — ' || sqlerrm);
  end;

  -- (c) reabre e tenta de novo: tem que passar
  update requisicoes set fechada_em = null where id = v_req;

  begin
    insert into movimentacoes (estoque_id, criado_por, tipo, quantidade, requisicao_item_id)
    select v_estoque, p.id, 'saida', 1, v_item from perfis p limit 1;
    insert into _verdito values ('5. reaberta aceita entrega', 'OK');
  exception when others then
    insert into _verdito values ('5. reaberta aceita entrega', 'FALHOU — ' || sqlerrm);
  end;

  -- (d) movimentação SEM requisição não é afetada pelo WHEN do trigger
  begin
    insert into movimentacoes (estoque_id, criado_por, tipo, quantidade)
    select v_estoque, p.id, 'entrada', 1 from perfis p limit 1;
    insert into _verdito values ('6. movimentacao sem requisicao passa', 'OK');
  exception when others then
    insert into _verdito values ('6. movimentacao sem requisicao passa', 'FALHOU — ' || sqlerrm);
  end;
end;
$$;

select * from _verdito order by etapa;

rollback;
```

Esperado: seis linhas, todas começando com **OK**. As duas de recusa devem trazer a
mensagem em português com a data do encerramento e o "Reabra-a para ...".

### 3. A RPC de entrega também é barrada

A RPC não tem checagem própria — ela cai no trigger, que é justamente o ponto do desenho.

```sql
begin;

drop table if exists _verdito_rpc;
create temp table _verdito_rpc (etapa text, resultado text);

do $$
declare
  v_estoque int;
  v_req     int;
begin
  select id into v_estoque from estoques where quantidade_atual >= 1 limit 1;

  insert into requisicoes (digitado_por, entregue_por, fechada_em)
  select id, id, now() from perfis limit 1
  returning id into v_req;

  begin
    perform fn_registra_saida_requisicao(
      p_estoque_id            => v_estoque,
      p_quantidade            => 1,
      p_quantidade_solicitada => 1,
      p_requisicao_id         => v_req
    );
    insert into _verdito_rpc values ('RPC em requisicao encerrada', 'FALHOU: a RPC gravou');
  exception when others then
    insert into _verdito_rpc values ('RPC em requisicao encerrada', 'OK — ' || sqlerrm);
  end;
end;
$$;

select * from _verdito_rpc;

rollback;
```

Esperado: uma linha, **OK**, com a mensagem do trigger. Aqui a recusa vem do
`tg_bloqueia_item_requisicao_fechada` (a RPC tenta criar o item antes da movimentação),
e é por isso que a mensagem fala de "adicionar itens" — a ordem interna da RPC decide
qual dos dois triggers fala primeiro.

### 4. Conferir pelo olho

```sql
select r.id, r.fechada_em,
       (select count(*) from requisicao_itens i where i.requisicao_id = r.id) as itens
  from requisicoes r
 where r.fechada_em is not null
 order by r.fechada_em desc
 limit 10;
```

Só para ver que nenhuma requisição encerrada mudou de tamanho depois da migração.

---

## Rollback da migração

```sql
begin;

drop trigger if exists tg_bloqueia_entrega_requisicao_fechada on movimentacoes;
drop trigger if exists tg_bloqueia_item_requisicao_fechada    on requisicao_itens;
drop function if exists fn_bloqueia_requisicao_fechada();

commit;
```

Nada a desfazer em dado: a migração não escreveu em linha nenhuma.

---

## Nota — o que a tela faz, e o que o banco faz

A tela da requisição esconde "Entregar" e "Adicionar item" quando o pedido está encerrado,
e o modal de "requisição existente" de Movimentações passou a listar só as abertas. Isso é
**cortesia**: evita oferecer um caminho que termina em erro.

A autoridade é o trigger, e a diferença importa em dois casos reais: uma aba aberta há meia
hora, com a requisição escolhida antes de alguém encerrá-la do outro lado, e a chamada
direta à API. Nos dois a tela não tem como saber, e o banco tem.
