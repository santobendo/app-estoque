# Fase 4 — RPC para adicionar apresentações a produto existente

**Onde rodar:** SQL Editor do Supabase (banco de **TESTES**).
**Pré-requisito:** Fases 1, 2 e 3 aplicadas (depende do motivo `saldo_inicial`).
**Impacto no app:** nenhum até a tela nova entrar. A função fica criada e parada.

Bloco único, sem conferência manual — pode colar inteiro.

---

## Por que uma função nova

Na busca-antes-de-criar existem dois caminhos de gravação:

| O usuário | Grava | Função |
|---|---|---|
| cadastra produto novo | produto + apresentações + estoques + saldo | `fn_cria_produto_completo` (já existe) |
| escolhe produto existente | apresentações + estoques + saldo | **esta aqui** |

Dava para fazer o segundo caso com três ou quatro chamadas do cliente, mas isso
reintroduz exatamente o problema que a RPC original foi criada para evitar: se a
segunda chamada falhar, a primeira já gravou, e sobra apresentação sem estoque ou
estoque sem saldo. Uma função = uma transação.

---

## 1. A função

```sql
create or replace function fn_adiciona_apresentacoes_produto(
  p_produto_id    int,
  p_apresentacoes jsonb
)
returns int
language plpgsql
security invoker
as $$
declare
  v_produto_nome text;
  v_ap           jsonb;
  v_ap_id        int;
  v_loc          jsonb;
  v_estoque_id   int;
  v_qtd          numeric;
  v_motivo_saldo int;
begin
  select id into v_motivo_saldo
    from motivos_movimentacao where codigo = 'saldo_inicial';

  if v_motivo_saldo is null then
    raise exception 'Motivo "saldo_inicial" não cadastrado. Rode o bloco 1 da migração 03.'
      using errcode = '23503';
  end if;

  select nome into v_produto_nome
    from produtos where id = p_produto_id;

  if v_produto_nome is null then
    raise exception 'Produto não encontrado.'
      using errcode = '02000';
  end if;

  for v_ap in select * from jsonb_array_elements(coalesce(p_apresentacoes, '[]'::jsonb)) loop

    if (v_ap->>'id') is not null then
      -- Apresentação que já existe. Confere que ela pertence mesmo ao produto
      -- informado — sem isso, um id arbitrário vindo do cliente permitiria
      -- pendurar estoque na apresentação de outro produto.
      select id into v_ap_id
        from apresentacoes
       where id = (v_ap->>'id')::int
         and produto_id = p_produto_id;

      if v_ap_id is null then
        raise exception 'Apresentação % não pertence ao produto "%".',
          v_ap->>'id', v_produto_nome
          using errcode = '23503';
      end if;

    else
      insert into apresentacoes (produto_id, descricao, quantidade_unitaria, unidade_id, criado_por)
      values (
        p_produto_id,
        coalesce(nullif(trim(v_ap->>'descricao'), ''), v_produto_nome),
        (v_ap->>'quantidade_unitaria')::numeric,
        (v_ap->>'unidade_id')::int,
        auth.uid()
      )
      returning id into v_ap_id;
    end if;

    for v_loc in select * from jsonb_array_elements(coalesce(v_ap->'locais', '[]'::jsonb)) loop
      insert into estoques (apresentacao_id, local_id)
      values (v_ap_id, (v_loc->>'local_id')::int)
      on conflict (apresentacao_id, local_id) do nothing
      returning id into v_estoque_id;

      -- Vínculo que já existia devolve nada, e v_estoque_id fica nulo. Nesse caso
      -- não se lança movimentação: somar saldo a um vínculo preexistente seria
      -- inflar estoque silenciosamente se o usuário reenviar o formulário.
      if v_estoque_id is not null then
        v_qtd := coalesce((v_loc->>'quantidade_inicial')::numeric, 0);
        if v_qtd > 0 then
          insert into movimentacoes (estoque_id, criado_por, tipo, quantidade, motivo_id)
          values (v_estoque_id, auth.uid(), 'entrada', v_qtd, v_motivo_saldo);
        end if;
      end if;
    end loop;
  end loop;

  return p_produto_id;
end;
$$;

comment on function fn_adiciona_apresentacoes_produto(int, jsonb) is
  'Adiciona apresentações (novas ou já existentes) e seus estoques a um produto que já existe, em transação única. Usada pela busca-antes-de-criar da tela de cadastro de produto.';
```

### Formato de `p_apresentacoes`

Cada item é uma apresentação existente (tem `id`) ou nova (tem `descricao`,
`quantidade_unitaria` e `unidade_id`). Os dois formatos podem vir no mesmo array:

```json
[
  { "id": 12,
    "locais": [{ "local_id": 2, "quantidade_inicial": 10 }] },

  { "descricao": "Fardo 30kg",
    "quantidade_unitaria": 30,
    "unidade_id": 3,
    "locais": [{ "local_id": 2, "quantidade_inicial": 0 }] }
]
```

### Segurança

`security invoker`, igual à irmã — cada insert passa pelo RLS do usuário logado:

- `apresentacoes` → `fn_pode_editar_algum_local()`
- `estoques` → `fn_pode_editar_local(local_id)`
- `movimentacoes` → gestão do local + `saldo_inicial` não é `ajuste`, então passa

Ou seja, o gerente da Cozinha consegue adicionar "Fardo 30kg" ao produto ARROZ e dar
saldo a ele **na Cozinha**, e recebe erro de permissão se tentar no Almoxarifado.

A checagem `produto_id` da apresentação existente é a única regra que o RLS não cobre:
ela é de integridade, não de permissão.

---

## 2. Conferência

```sql
-- 2.1 Função criada
select proname from pg_proc where proname = 'fn_adiciona_apresentacoes_produto';
-- Esperado: 1 linha

-- 2.2 Teste como não-admin, em transação com rollback.
--     Pegue um par usuário + local (como postgres, fora da transação):
select ul.usuario_id, ul.local_id, p.nome, l.nome as local
from usuarios_locais ul
join perfis p on p.id = ul.usuario_id
join locais l on l.id = ul.local_id
where ul.pode_editar and p.is_admin = false and p.ativo
limit 5;
```

```sql
-- Escolha um produto que ainda NÃO tenha estoque no local escolhido:
select p.id as produto_id, p.nome, a.id as apresentacao_id, a.descricao
from produtos p
join apresentacoes a on a.produto_id = p.id
where not exists (
  select 1 from estoques e
  where e.apresentacao_id = a.id
    and e.local_id = COLE-O-LOCAL-ID-AQUI
)
limit 5;
```

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select fn_adiciona_apresentacoes_produto(
    COLE-O-PRODUTO-ID-AQUI,
    jsonb_build_array(
      jsonb_build_object(
        'id', COLE-A-APRESENTACAO-ID-AQUI,
        'locais', jsonb_build_array(
          jsonb_build_object('local_id', COLE-O-LOCAL-ID-AQUI, 'quantidade_inicial', 7)
        )
      )
    )
  ) as produto_id;

  -- confere que o estoque e a movimentação nasceram juntos
  select e.id, e.quantidade_atual, mo.codigo as motivo
  from estoques e
  left join movimentacoes m       on m.estoque_id = e.id
  left join motivos_movimentacao mo on mo.id = m.motivo_id
  where e.apresentacao_id = COLE-A-APRESENTACAO-ID-AQUI
    and e.local_id        = COLE-O-LOCAL-ID-AQUI;
rollback;
```

Esperado: `quantidade_atual = 7` e `motivo = saldo_inicial`.

```sql
-- 2.3 Rejeita apresentação de outro produto.
--     Troque o produto_id por um que NÃO seja dono da apresentação.
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select fn_adiciona_apresentacoes_produto(
    COLE-UM-PRODUTO-ID-DIFERENTE,
    jsonb_build_array(
      jsonb_build_object('id', COLE-A-APRESENTACAO-ID-AQUI, 'locais', '[]'::jsonb)
    )
  );
rollback;
```

Esperado: erro `Apresentação N não pertence ao produto "..."`.

---

## Rollback

```sql
drop function if exists fn_adiciona_apresentacoes_produto(int, jsonb);
```
