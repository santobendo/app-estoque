# Fase 3 — Motivo `saldo_inicial` e unicidade de apresentação

**Onde rodar:** SQL Editor do Supabase (banco de **TESTES**).
**Pré-requisito:** Fases 1 e 2 aplicadas.

Duas coisas independentes:

1. **Corrige o bug** que a feature de ajuste introduziu — não-admin não consegue
   cadastrar produto com saldo inicial maior que zero.
2. **Impede apresentação duplicada** no mesmo produto, antes que a
   busca-antes-de-criar torne isso rotina.

O bloco 4 é opcional e o bloco 3 exige conferência manual. Leia antes de colar tudo.

---

## O bug, em uma frase

`fn_cria_produto_completo` grava o saldo inicial com motivo `ajuste`, e a policy da
feature anterior restringiu `ajuste` a admin. Como a RPC é `security invoker`, o RLS se
aplica: **não-admin que cadastra produto com quantidade inicial > 0 recebe erro de
permissão e perde a transação inteira.** Com quantidade zero funciona, o que deixa a
falha intermitente e difícil de diagnosticar.

A saída é separar os dois conceitos. "Saldo inicial de cadastro" não é "reconciliação de
contagem física" — reusar o mesmo motivo foi o que causou a colisão.

---

## 1. Novo motivo

```sql
insert into motivos_movimentacao (codigo, descricao)
values ('saldo_inicial', 'Saldo inicial do cadastro')
on conflict (codigo) do nothing;
```

> **Não precisa mexer em `vw_consumo_30_dias`.** A view só soma `m.tipo = 'saida'`, e
> saldo inicial é sempre `entrada` — nunca entra no cálculo de consumo.
>
> **Não precisa mexer na tela de movimentações.** `Movimentacoes.jsx:212-215` monta o
> dropdown por allowlist (`['compra','outro']` e `['uso','descarte','outro']`), então o
> motivo novo não aparece para seleção manual — que é o desejado, já que ele é gerado
> apenas pelo cadastro de produto.

---

## 2. RPC passa a usar o motivo novo

Mesma função de antes, com duas mudanças: usa `saldo_inicial` e falha com mensagem
clara se o motivo não existir (em vez de gravar `motivo_id` nulo em silêncio).

```sql
create or replace function fn_cria_produto_completo(
  p_nome          text,
  p_categoria_id  int,
  p_apresentacoes jsonb
)
returns int
language plpgsql
security invoker
as $$
declare
  v_produto_id    int;
  v_ap            jsonb;
  v_ap_id         int;
  v_loc           jsonb;
  v_estoque_id    int;
  v_qtd           numeric;
  v_motivo_saldo  int;
begin
  select id into v_motivo_saldo
    from motivos_movimentacao where codigo = 'saldo_inicial';

  if v_motivo_saldo is null then
    raise exception 'Motivo "saldo_inicial" não cadastrado. Rode o bloco 1 da migração 03.'
      using errcode = '23503';
  end if;

  insert into produtos (nome, categoria_id, criado_por)
  values (upper(trim(p_nome)), p_categoria_id, auth.uid())
  returning id into v_produto_id;

  for v_ap in select * from jsonb_array_elements(coalesce(p_apresentacoes, '[]'::jsonb)) loop
    insert into apresentacoes (produto_id, descricao, quantidade_unitaria, unidade_id, criado_por)
    values (
      v_produto_id,
      coalesce(nullif(trim(v_ap->>'descricao'), ''), upper(trim(p_nome))),
      (v_ap->>'quantidade_unitaria')::numeric,
      (v_ap->>'unidade_id')::int,
      auth.uid()
    )
    returning id into v_ap_id;

    for v_loc in select * from jsonb_array_elements(coalesce(v_ap->'locais', '[]'::jsonb)) loop
      insert into estoques (apresentacao_id, local_id)
      values (v_ap_id, (v_loc->>'local_id')::int)
      returning id into v_estoque_id;

      -- Saldo inicial entra como movimentação própria, preservando o histórico
      -- (o trigger atualiza o saldo). Motivo separado de 'ajuste', que é
      -- reconciliação de contagem física e é restrito a admin.
      v_qtd := coalesce((v_loc->>'quantidade_inicial')::numeric, 0);
      if v_qtd > 0 then
        insert into movimentacoes (estoque_id, criado_por, tipo, quantidade, motivo_id)
        values (v_estoque_id, auth.uid(), 'entrada', v_qtd, v_motivo_saldo);
      end if;
    end loop;
  end loop;

  return v_produto_id;
end;
$$;

comment on function fn_cria_produto_completo(text, int, jsonb) is
  'Cria produto, apresentações, estoques e saldo inicial em uma transação única. Usada pela tela de cadastro de produto.';
```

---

## 3. Apresentação duplicada — **confira antes de aplicar**

`apresentacoes` não tem unicidade em `(produto_id, descricao)`. Hoje quase não aparece,
porque quase ninguém abre ProdutoDetalhe para adicionar apresentação. A
busca-antes-de-criar empurra exatamente para lá, então "ARROZ / Pacote 5kg" duplicado
viraria rotina.

### 3.1 Primeiro, veja se já existe duplicata

```sql
select produto_id,
       lower(trim(descricao))    as descricao_normalizada,
       count(*)                  as quantas,
       array_agg(id order by id) as ids
from apresentacoes
group by produto_id, lower(trim(descricao))
having count(*) > 1;
```

**Se voltar vazio, pule para o 3.2.**

Se voltar alguma linha, veja o que cada duplicata carrega antes de decidir qual apagar:

```sql
select a.id, p.nome as produto, a.descricao,
       count(distinct e.id)  as locais_vinculados,
       coalesce(sum(e.quantidade_atual), 0) as saldo_total,
       count(m.id)           as movimentacoes
from apresentacoes a
join produtos p       on p.id = a.produto_id
left join estoques e  on e.apresentacao_id = a.id
left join movimentacoes m on m.estoque_id = e.id
where a.id in ( /* cole aqui os ids do array acima */ )
group by a.id, p.nome, a.descricao
order by p.nome, a.descricao, a.id;
```

Mantenha a que tem movimentações e saldo; a vazia pode ser removida.
`estoques.apresentacao_id` é `on delete restrict`, então apague os estoques dela antes.

### 3.2 Aplique a unicidade

Índice funcional, não `constraint`, para ser insensível a maiúscula e espaço —
"Pacote 5kg", "PACOTE 5KG" e "Pacote 5kg " passam a colidir, que é o que se quer.

```sql
create unique index if not exists idx_apresentacoes_descricao_unica
  on apresentacoes (produto_id, lower(trim(descricao)));

comment on index idx_apresentacoes_descricao_unica is
  'Impede duas apresentações com a mesma descrição no mesmo produto, ignorando caixa e espaços nas pontas.';
```

> Se o comando falhar com `23505`, ainda há duplicata — volte ao 3.1.
> A violação chega no frontend como código `23505`, que o `traduzErro` já trata.

---

## 4. Reclassificar o histórico — **opcional**

As movimentações de saldo inicial já gravadas continuam com motivo `ajuste`. Isso não
afeta cálculo nenhum (são entradas; o consumo só soma saídas) — é puramente cosmético,
para o Histórico deixar de chamar cadastro de "Ajuste de inventário".

### 4.1 Prévia — rode isto primeiro e confira a lista

```sql
select m.id, m.data, p.nome as produto, a.descricao as apresentacao,
       l.nome as local, m.quantidade
from movimentacoes m
join estoques e            on e.id = m.estoque_id
join apresentacoes a       on a.id = e.apresentacao_id
join produtos p            on p.id = a.produto_id
join locais l              on l.id = e.local_id
join motivos_movimentacao mo on mo.id = m.motivo_id
where mo.codigo = 'ajuste'
  and m.tipo    = 'entrada'
  and m.data   <= e.criado_em + interval '5 seconds'
order by m.data;
```

O critério é: entrada, motivo `ajuste`, lançada no mesmo instante em que o estoque foi
criado — a assinatura do que a RPC gerava. Um ajuste de verdade feito segundos depois de
criar o estoque cairia aqui por engano, mas é improvável; a prévia existe para você
confirmar.

### 4.2 Só se a lista acima estiver correta

```sql
update movimentacoes m
   set motivo_id = (select id from motivos_movimentacao where codigo = 'saldo_inicial')
  from estoques e,
       motivos_movimentacao mo
 where e.id       = m.estoque_id
   and mo.id      = m.motivo_id
   and mo.codigo  = 'ajuste'
   and m.tipo     = 'entrada'
   and m.data    <= e.criado_em + interval '5 seconds';
```

---

## 5. Conferência

```sql
-- 5.1 Motivo criado
select id, codigo, descricao from motivos_movimentacao order by id;
-- Esperado: uso, descarte, compra, ajuste, outro, saldo_inicial.

-- 5.2 A RPC aponta para o motivo novo
select pg_get_functiondef('fn_cria_produto_completo(text,int,jsonb)'::regprocedure)
       like '%saldo_inicial%' as rpc_atualizada;
-- Esperado: true

-- 5.3 Índice de unicidade no lugar
select indexname from pg_indexes
where tablename = 'apresentacoes' and indexname = 'idx_apresentacoes_descricao_unica';
-- Esperado: 1 linha

-- 5.4 Nenhuma movimentação de ajuste sobrou com cara de saldo inicial
--     (só faz sentido se você rodou o bloco 4)
select count(*) as ajustes_com_cara_de_saldo_inicial
from movimentacoes m
join estoques e              on e.id = m.estoque_id
join motivos_movimentacao mo on mo.id = m.motivo_id
where mo.codigo = 'ajuste' and m.tipo = 'entrada'
  and m.data <= e.criado_em + interval '5 seconds';
-- Esperado: 0
```

### 5.5 O teste que prova o bug consertado

Confirma que um não-admin consegue cadastrar produto com saldo inicial.
Roda em transação com `rollback` — nada fica gravado.

Primeiro, **como postgres**, pegue um par usuário + local. A consulta a
`usuarios_locais` precisa ficar fora da transação de teste: lá dentro o role é
`authenticated`, e o resultado dependeria do RLS da própria tabela.

```sql
select ul.usuario_id, ul.local_id, p.nome, l.nome as local
from usuarios_locais ul
join perfis p on p.id = ul.usuario_id
join locais l on l.id = ul.local_id
where ul.pode_editar and p.is_admin = false and p.ativo
limit 5;
```

Agora cole os **dois** valores (o UUID e o `local_id`) como literais:

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select fn_cria_produto_completo(
    'PRODUTO TESTE MIGRACAO 03',
    null,
    jsonb_build_array(
      jsonb_build_object(
        'descricao', 'Pacote 1kg',
        'quantidade_unitaria', 1,
        'unidade_id', (select id from unidades limit 1),
        'locais', jsonb_build_array(
          jsonb_build_object(
            'local_id', COLE-O-LOCAL-ID-AQUI,
            'quantidade_inicial', 10
          )
        )
      )
    )
  ) as produto_id_criado;
rollback;
```

Tem que retornar um id. **Antes desta migração, este mesmo comando falhava** com
`new row violates row-level security policy for table "movimentacoes"` — que é
exatamente o erro que o usuário veria na tela.

---

## Rollback

```sql
drop index if exists idx_apresentacoes_descricao_unica;
```

A RPC e o motivo não precisam de rollback: voltar a usar `ajuste` reintroduziria o bug.
Se precisar mesmo, o corpo antigo está em `estoque_schema_normalizado.sql` no
histórico do git (seção 18.1, antes desta migração).
