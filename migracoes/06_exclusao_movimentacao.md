# Fase 6 — Admin exclui movimentação

**Onde rodar:** SQL Editor do Supabase (banco de **TESTES**).
**Pré-requisito:** `fn_is_admin()` (existe desde o schema original).
**Impacto no app:** nenhum até a tela entrar. Hoje `movimentacoes` não tem policy de
DELETE, então ninguém consegue excluir — nem admin.

Dois blocos: o trigger que devolve o saldo e a policy que libera o DELETE para admin.

---

## O ponto que decide o desenho

`fn_atualiza_estoque` é `after insert`: toda entrada soma e toda saída subtrai de
`estoques.quantidade_atual`. **Não existe o caminho de volta.** Se o DELETE fosse
liberado sem mais nada, a movimentação sairia do histórico e o saldo ficaria com o
efeito dela para sempre — exatamente a incoerência que você apontou.

Então a reversão vai num trigger `after delete`, e não dentro de uma função RPC. O
motivo é garantia: com o trigger, **qualquer** caminho que apague uma movimentação
devolve o saldo, inclusive um `delete` manual no SQL Editor. Numa RPC, a coerência
dependeria de todo mundo lembrar de chamá-la.

### O caso que precisa ser bloqueado

Entrada de 10, depois saída de 8. Saldo = 2. Excluir a entrada deixaria o saldo em −8,
e a constraint `estoques_quantidade_nao_negativa` recusa.

Bloquear é o certo, e não é só a constraint falando: se aquela entrada nunca existiu,
a saída de 8 também não poderia ter acontecido. Os dois registros estão errados, e
adivinhar qual corrigir não é trabalho do banco. O trigger recusa com uma mensagem que
diz o que fazer no lugar — um ajuste de contagem física, que já existe na tela de
Movimentações e preserva o histórico.

---

## 1. Trigger de reversão

```sql
create or replace function fn_reverte_estoque()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saldo numeric;
  v_novo  numeric;
begin
  -- for update trava a linha do estoque até o fim da transação. Sem a trava,
  -- uma movimentação registrada em paralelo entraria entre esta leitura e o
  -- update abaixo, e o valor absoluto gravado aqui apagaria o efeito dela.
  select quantidade_atual into v_saldo
    from estoques
   where id = OLD.estoque_id
     for update;

  if not found then
    return OLD;   -- estoque já removido na mesma transação; nada a devolver
  end if;

  v_novo := case OLD.tipo
              when 'entrada' then v_saldo - OLD.quantidade
              else                v_saldo + OLD.quantidade
            end;

  if v_novo < 0 then
    raise exception
      'Excluir esta movimentação deixaria o saldo em %. Houve movimentações posteriores que dependem dela — corrija com um ajuste de contagem física em vez de excluir.',
      v_novo
      using errcode = '23514';
  end if;

  update estoques
     set quantidade_atual = v_novo,
         atualizado_em    = now()
   where id = OLD.estoque_id;

  return OLD;
end;
$$;

create trigger tg_reverte_estoque
after delete on movimentacoes
for each row execute function fn_reverte_estoque();

comment on function fn_reverte_estoque() is
  'Devolve ao estoque o efeito de uma movimentação excluída: entrada subtrai, saída soma. Espelho de fn_atualiza_estoque. Recusa a exclusão se o saldo ficaria negativo.';
```

> `security definer` pelo mesmo motivo de `fn_atualiza_estoque`: o update em `estoques`
> não pode depender de policy de UPDATE. Só admin chega aqui pela policy do bloco 2,
> mas a função não fica acoplada a isso.

---

## 2. Policy de DELETE

```sql
drop policy if exists "admin pode deletar movimentacoes" on movimentacoes;

create policy "admin pode deletar movimentacoes"
  on movimentacoes for delete to authenticated
  using (fn_is_admin());
```

Só `fn_is_admin()`, sem checagem de local: admin já enxerga e gerencia todos os locais
por definição, e um admin que pode lançar ajuste de contagem em qualquer lugar não
ganha poder novo aqui.

---

## 3. Conferência

### 3.1 Trigger e policy no lugar

```sql
select tgname, tgenabled
  from pg_trigger
 where tgrelid = 'movimentacoes'::regclass
   and not tgisinternal;

select policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename = 'movimentacoes'
 order by cmd;
```

Esperado: os triggers `tg_atualiza_estoque` e `tg_reverte_estoque`, ambos com
`tgenabled` = `O`; e três policies — DELETE, INSERT e SELECT.

### 3.2 O saldo volta — entrada

Roda tudo dentro de `begin/rollback`, então **nada fica gravado**.

```sql
begin;
  -- escolhe um estoque que já tenha saldo
  create temp table t_alvo as
    select e.id as estoque_id, e.quantidade_atual as saldo_antes,
           (select id from perfis where is_admin limit 1) as admin_id
      from estoques e
     where e.quantidade_atual > 0
     limit 1;

  -- lança uma entrada de 5 e confere que subiu
  insert into movimentacoes (estoque_id, criado_por, tipo, quantidade)
  select estoque_id, admin_id, 'entrada', 5 from t_alvo;

  select t.saldo_antes,
         e.quantidade_atual as depois_da_entrada
    from t_alvo t join estoques e on e.id = t.estoque_id;

  -- exclui a entrada recém-criada e confere que voltou ao valor original
  delete from movimentacoes
   where id = (select max(id) from movimentacoes);

  select t.saldo_antes,
         e.quantidade_atual as depois_da_exclusao,
         e.quantidade_atual = t.saldo_antes as voltou_ao_original
    from t_alvo t join estoques e on e.id = t.estoque_id;
rollback;
```

Esperado: `depois_da_entrada` = `saldo_antes` + 5, e `voltou_ao_original` = **true**.

### 3.3 O saldo volta — saída

```sql
begin;
  create temp table t_alvo as
    select e.id as estoque_id, e.quantidade_atual as saldo_antes,
           (select id from perfis where is_admin limit 1) as admin_id
      from estoques e
     where e.quantidade_atual >= 1
     limit 1;

  insert into movimentacoes (estoque_id, criado_por, tipo, quantidade)
  select estoque_id, admin_id, 'saida', 1 from t_alvo;

  delete from movimentacoes where id = (select max(id) from movimentacoes);

  select e.quantidade_atual = t.saldo_antes as voltou_ao_original
    from t_alvo t join estoques e on e.id = t.estoque_id;
rollback;
```

Esperado: `voltou_ao_original` = **true**.

### 3.4 Saldo negativo é recusado

Este é o teste que prova a proteção. Lança entrada de 5, consome os 5, e tenta excluir
a entrada.

```sql
begin;
  create temp table t_alvo as
    select e.id as estoque_id,
           (select id from perfis where is_admin limit 1) as admin_id
      from estoques e limit 1;

  insert into movimentacoes (estoque_id, criado_por, tipo, quantidade)
  select estoque_id, admin_id, 'entrada', 5 from t_alvo;

  create temp table t_mov as select max(id) as id from movimentacoes;

  insert into movimentacoes (estoque_id, criado_por, tipo, quantidade)
  select estoque_id, admin_id, 'saida', 5 from t_alvo;

  -- tenta excluir a entrada: a saída de 5 depende dela
  delete from movimentacoes where id = (select id from t_mov);
rollback;
```

**O resultado esperado é erro**, e não sucesso: `23514`, com a mensagem
"Excluir esta movimentação deixaria o saldo em …". O SQL Editor aborta a transação —
é isso mesmo. Rode o `rollback;` sozinho depois, se ele reclamar de transação aberta.

### 3.5 Não-admin não exclui

```sql
select id, nome from perfis where is_admin = false order by nome;
```

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-DO-NAO-ADMIN"}';

  -- pega uma movimentação visível e tenta excluir
  with alvo as (select id from movimentacoes limit 1)
  delete from movimentacoes m
   using alvo
   where m.id = alvo.id
  returning m.id;
rollback;
```

Esperado: **0 linhas**, sem erro. É assim que o RLS recusa um DELETE — silenciosamente.
Por isso a tela confere quantas linhas voltaram em vez de confiar na ausência de erro.

---

## Rollback

```sql
drop trigger  if exists tg_reverte_estoque on movimentacoes;
drop function if exists fn_reverte_estoque();
drop policy   if exists "admin pode deletar movimentacoes" on movimentacoes;
```

A ordem importa: a policy sai por último, porque sem ela ninguém exclui mais nada —
que é o estado de antes desta migração.
