# Fase 2 — Acesso por local: policies e views

**Onde rodar:** SQL Editor do Supabase (banco de **TESTES**), executa como `postgres`.
**Pré-requisito:** Fase 1 rodada, incluindo o backfill do bloco 6.
**Idempotente:** todo `create policy` vem com `drop policy if exists` antes.

**Impacto no app:** com o backfill da Fase 1 aplicado, o comportamento continua
**idêntico** para todos os usuários — porque hoje todo não-admin tem `pode_editar = true`
em todos os locais. A diferença só aparece quando o admin começar a revogar acesso.

A única exceção é o bloco 2.4 (criar local vira exclusivo de admin), que é uma
mudança de comportamento real. Está explicada lá.

> **Se o backfill não rodou, NÃO execute esta fase.** Todo não-admin perde acesso a tudo.
> Confira antes:
> ```sql
> select count(*) from usuarios_locais;
> ```
> Tem que ser `(nº de não-admins) × (nº de locais)`, e maior que zero.

---

## 1. Leitura — restringe aos locais permitidos

O coração da fase. Três tabelas passam a filtrar por local.

```sql
-- 1.1 locais — o usuário só enxerga os locais que lhe foram concedidos.
-- Isso faz o seletor da TopBar se filtrar sozinho, sem mudar o frontend.
drop policy if exists "autenticados podem ler locais" on locais;
create policy "usuario le locais permitidos"
  on locais for select to authenticated
  using (fn_pode_ver_local(id));

-- 1.2 estoques — saldo por local.
drop policy if exists "autenticados podem ler estoques" on estoques;
create policy "usuario le estoques dos locais permitidos"
  on estoques for select to authenticated
  using (fn_pode_ver_local(local_id));

-- 1.3 movimentacoes — não tem local_id; chega nele via estoques.
drop policy if exists "autenticados podem ler movimentacoes" on movimentacoes;
create policy "usuario le movimentacoes dos locais permitidos"
  on movimentacoes for select to authenticated
  using (
    exists (
      select 1 from estoques e
      where e.id = estoque_id
        and fn_pode_ver_local(e.local_id)
    )
  );
```

**Continuam abertas de propósito:** `produtos`, `apresentacoes`, `categorias`,
`unidades`, `motivos_movimentacao`, `papeis` e `perfis`. Nome de produto é dado mestre
global, não é sensível — e manter isso legível é o que viabiliza a busca-antes-de-criar.
O que é sensível é **quantidade por local**, e isso está coberto acima.

---

## 2. Escrita — exige gestão do local

```sql
-- 2.1 produtos — global, sem local_id: exige gestão em algum local.
drop policy if exists "ativos podem inserir produtos" on produtos;
create policy "gestores podem inserir produtos"
  on produtos for insert to authenticated
  with check (fn_pode_editar_algum_local());

-- 2.2 apresentacoes — mesma regra de produtos.
drop policy if exists "ativos podem inserir apresentacoes" on apresentacoes;
create policy "gestores podem inserir apresentacoes"
  on apresentacoes for insert to authenticated
  with check (fn_pode_editar_algum_local());

-- 2.3 estoques — aqui existe local_id, então a checagem é precisa:
-- o gerente da Cozinha cria o produto globalmente, mas só consegue
-- dar saldo a ele na Cozinha.
drop policy if exists "ativos podem inserir estoques" on estoques;
create policy "gestores podem inserir estoques"
  on estoques for insert to authenticated
  with check (fn_pode_editar_local(local_id));
```

### 2.4 Criar local vira exclusivo de admin — **mudança de comportamento**

Hoje qualquer usuário ativo pode criar local (`with check (fn_is_ativo())`), mas
atualizar e deletar já são de admin. Essa assimetria parece descuido, e a partir da
Fase 2 ela vira uma armadilha concreta: quem criar um local **não recebe acesso a ele**
(nenhuma linha em `usuarios_locais` é gerada), então o local some da tela no instante
seguinte, sem explicação nenhuma.

```sql
drop policy if exists "ativos podem inserir locais" on locais;
create policy "admin pode inserir locais"
  on locais for insert to authenticated
  with check (fn_is_admin());
```

> Se você prefere manter criação de local liberada, **pule só este bloco** — o resto
> da fase funciona sem ele. Mas aí a armadilha acima passa a existir.

### 2.5 Movimentações — local + a regra de ajuste

```sql
drop policy if exists "ativos podem inserir movimentacoes" on movimentacoes;
create policy "gestores podem inserir movimentacoes"
  on movimentacoes for insert to authenticated
  with check (
    criado_por = auth.uid()
    and exists (
      select 1 from estoques e
      where e.id = estoque_id
        and fn_pode_editar_local(e.local_id)
    )
    and (
      not exists (
        select 1 from motivos_movimentacao mo
        where mo.id = motivo_id and mo.codigo = 'ajuste'
      )
      or fn_is_admin()
    )
  );
```

Três condições: a movimentação é minha, eu gerencio o local dela, e ajuste de
inventário continua exclusivo de admin. `fn_is_ativo()` saiu daqui porque
`fn_pode_editar_local()` já faz essa checagem por dentro.

> `movimentacoes` não tem policy de UPDATE nem de DELETE, e continua assim.
> O histórico é imutável para todo mundo, admin incluído.

---

## 3. Estoque mínimo — via função, não via UPDATE na tabela

Decisão: gerente do local pode editar o estoque mínimo. Mas **não** dando `UPDATE`
em `estoques` para não-admin — a explicação está no fim do arquivo. Em vez disso,
uma função que altera exatamente um campo.

```sql
create or replace function fn_define_estoque_minimo(
  p_estoque_id int,
  p_valor      numeric
)
returns void
language plpgsql
security definer
as $$
declare
  v_local_id int;
begin
  select local_id into v_local_id
    from estoques where id = p_estoque_id;

  if v_local_id is null then
    raise exception 'Estoque não encontrado.'
      using errcode = '02000';
  end if;

  if not fn_pode_editar_local(v_local_id) then
    raise exception 'Sem permissão para alterar o estoque mínimo deste local.'
      using errcode = '42501';
  end if;

  if p_valor is null or p_valor < 0 then
    raise exception 'Estoque mínimo não pode ser negativo.'
      using errcode = '23514';
  end if;

  update estoques
     set estoque_minimo = p_valor,
         atualizado_em  = now()
   where id = p_estoque_id;
end;
$$;

comment on function fn_define_estoque_minimo(int, numeric) is
  'Altera o estoque mínimo de um estoque, se o usuário gerencia o local. Existe para não conceder UPDATE em estoques a não-admins, o que permitiria reescrever quantidade_atual por fora do histórico de movimentações.';
```

A policy `"admin pode atualizar estoques"` fica como está. A tela passa a chamar esta
função na Fase 4; até lá nada muda, porque hoje o campo já é editável só por admin.

---

## 4. Views — parar de furar o RLS

Views em Postgres rodam com a permissão do **dono** por padrão. Sem isto, as três views
devolveriam todos os locais para qualquer usuário autenticado, e a Fase 2 inteira viraria
enfeite: bastaria consultar `vw_auditoria_movimentacoes` para ver o estoque alheio.

```sql
alter view vw_consumo_30_dias         set (security_invoker = on);
alter view vw_sugestao_compra         set (security_invoker = on);
alter view vw_auditoria_movimentacoes set (security_invoker = on);
```

> `vw_sugestao_compra` lê de `vw_consumo_30_dias`. As duas precisam do flag — se só a
> externa receber, a interna continua rodando como dona e o filtro não propaga.
> Requer PostgreSQL 15+. Confirme com `show server_version;` antes de rodar.

---

## 5. Conferência

### 5.1 Estrutura

```sql
-- As três views com security_invoker ligado
select c.relname,
       coalesce(
         (select option_value from pg_options_to_table(c.reloptions)
          where option_name = 'security_invoker'),
         'off'
       ) as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
order by c.relname;
-- Esperado: as 3 views com "on" (ou "true").

-- Policies de leitura que sobraram como abertas
select tablename, policyname, qual
from pg_policies
where schemaname = 'public' and cmd = 'SELECT' and qual = 'true'
order by tablename;
-- Esperado: apresentacoes, categorias, motivos_movimentacao, papeis,
-- perfis, produtos, unidades. Se "locais", "estoques" ou "movimentacoes"
-- aparecerem aqui, o bloco 1 não pegou.
```

### 5.2 Teste como usuário real

Este é o teste que importa. Substitua o UUID e rode dentro da transação —
o `rollback` no fim garante que nada é gravado.

```sql
-- Pegue um UUID de não-admin:
select id, nome from perfis where is_admin = false order by nome;
```

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select count(*) as locais_visiveis        from locais;
  select count(*) as estoques_visiveis      from estoques;
  select count(*) as movimentacoes_visiveis from movimentacoes;
  select count(*) as sugestoes_visiveis     from vw_sugestao_compra;
  select count(*) as auditoria_visivel      from vw_auditoria_movimentacoes;
rollback;
```

Com o backfill aplicado, todos devem trazer os mesmos números de antes.

Agora o teste de verdade — revogue um local e veja os números caírem:

```sql
begin;
  -- remove o acesso de um usuário a um local (desfeito no rollback)
  delete from usuarios_locais
   where usuario_id = 'COLE-O-UUID-AQUI'
     and local_id   = 1;

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select count(*) as locais_visiveis   from locais;
  select count(*) as estoques_visiveis from estoques;
  select count(*) as auditoria_visivel from vw_auditoria_movimentacoes;
rollback;
```

Os três têm que diminuir. Se `auditoria_visivel` **não** cair, o
`security_invoker` do bloco 4 não pegou — e esse é exatamente o furo que ele fecha.

---

## Por que estoque mínimo não virou policy de UPDATE

O caminho óbvio para a decisão 1 seria:

```sql
create policy "gestor pode atualizar estoques"
  on estoques for update to authenticated
  using (fn_pode_editar_local(local_id));   -- NÃO faça isso
```

Isso concede `UPDATE` na **linha inteira**, não no campo. `estoque_minimo` e
`quantidade_atual` moram na mesma linha, e o RLS do Postgres não tem granularidade de
coluna. Um gerente poderia mandar direto para a API:

```
PATCH /rest/v1/estoques?id=eq.42   { "quantidade_atual": 9999 }
```

E o saldo mudaria **sem gerar movimentação nenhuma** — sem histórico, sem autoria, sem
aparecer na auditoria. A chave anon é pública e está no bundle do frontend, então isso
não exige nada além de um `curl`.

Pior: torna a regra de "ajuste só por admin", que acabamos de construir, contornável.
O objetivo dela é que reconciliar saldo com contagem física deixe rastro; um `PATCH`
direto faz o mesmo efeito e não deixa nada.

`fn_define_estoque_minimo` fecha isso pela superfície: a função só toca em um campo,
e `quantidade_atual` continua mudando apenas pelo trigger de movimentações — que é a
premissa que o `security definer` do `fn_atualiza_estoque` assume
(`estoque_schema_normalizado.sql:260-262` diz isso explicitamente no comentário).

---

## Fora do escopo, anotado

`perfis` continua com SELECT `using (true)` — qualquer autenticado lê o nome e o
`is_admin` de todos. Não é regressão (já era assim) e o Histórico depende disso para
mostrar o autor de cada movimentação. Mas vale revisar um dia.

---

## Rollback

Volta ao estado da Fase 1 (estrutura criada, nada usando ela).

```sql
-- Leitura volta a ser aberta
drop policy if exists "usuario le locais permitidos" on locais;
create policy "autenticados podem ler locais"
  on locais for select to authenticated using (true);

drop policy if exists "usuario le estoques dos locais permitidos" on estoques;
create policy "autenticados podem ler estoques"
  on estoques for select to authenticated using (true);

drop policy if exists "usuario le movimentacoes dos locais permitidos" on movimentacoes;
create policy "autenticados podem ler movimentacoes"
  on movimentacoes for select to authenticated using (true);

-- Escrita volta a exigir só "ativo"
drop policy if exists "gestores podem inserir produtos" on produtos;
create policy "ativos podem inserir produtos"
  on produtos for insert to authenticated with check (fn_is_ativo());

drop policy if exists "gestores podem inserir apresentacoes" on apresentacoes;
create policy "ativos podem inserir apresentacoes"
  on apresentacoes for insert to authenticated with check (fn_is_ativo());

drop policy if exists "gestores podem inserir estoques" on estoques;
create policy "ativos podem inserir estoques"
  on estoques for insert to authenticated with check (fn_is_ativo());

drop policy if exists "admin pode inserir locais" on locais;
create policy "ativos podem inserir locais"
  on locais for insert to authenticated with check (fn_is_ativo());

drop policy if exists "gestores podem inserir movimentacoes" on movimentacoes;
create policy "ativos podem inserir movimentacoes"
  on movimentacoes for insert to authenticated
  with check (
    criado_por = auth.uid()
    and fn_is_ativo()
    and (
      not exists (
        select 1 from motivos_movimentacao mo
        where mo.id = motivo_id and mo.codigo = 'ajuste'
      )
      or fn_is_admin()
    )
  );

-- Views voltam a rodar como donas
alter view vw_consumo_30_dias         set (security_invoker = off);
alter view vw_sugestao_compra         set (security_invoker = off);
alter view vw_auditoria_movimentacoes set (security_invoker = off);

drop function if exists fn_define_estoque_minimo(int, numeric);
```
