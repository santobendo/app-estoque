# Produção — script único (migrações 01 a 04 + ajuste de estoque)

**Onde rodar:** SQL Editor do Supabase, banco de **PRODUÇÃO**.
**Origem:** consolida `migracoes/01` a `04`, já aplicadas e testadas no banco de
testes, mais o `migracao_ajuste_estoque.sql`, que provavelmente nunca rodou lá.

> **Por que o ajuste entra aqui.** O commit `d218210` está em `main`, ou seja, a tela
> de ajuste de contagem **já está no ar**, mas o `migracao_ajuste_estoque.sql` foi
> marcado como "aplicado em teste; falta produção". Enquanto ele não rodar, todo
> ajuste lançado em produção conta como consumo e infla a Sugestão de Compra. Os
> comandos dele são idempotentes: se você já rodou lá, esta parte não muda nada.

Leia a **Parte 0** antes de colar qualquer coisa. Ela é só leitura e existe para
evitar as duas formas de esta migração dar errado em produção sem dar erro.

---

## Parte 0 — Pré-voo (somente leitura)

### 0.1 Versão do Postgres

```sql
show server_version;
```

`security_invoker` em view exige **15 ou maior**. Abaixo disso, pare: as views
continuariam furando o RLS e a restrição por local viraria enfeite.

### 0.2 O terreno está como se espera?

```sql
select
  to_regclass('public.usuarios_locais')                                   as ja_tem_usuarios_locais,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'estoques'
      and column_name = 'estoque_minimo')                                 as tem_estoque_minimo,
  (select count(*) from pg_proc where proname = 'fn_is_ativo')            as tem_fn_is_ativo,
  (select count(*) from pg_proc where proname = 'fn_is_admin')            as tem_fn_is_admin,
  (select count(*) from pg_proc where proname = 'fn_cria_produto_completo') as tem_rpc_produto;
```

Esperado: `ja_tem_usuarios_locais` **nulo** (a migração ainda não rodou) e os outros
quatro em **1**. Se algum dos quatro vier 0, produção está atrás do que este script
assume — pare e me avise.

### 0.3 Apresentações duplicadas — **o que mais tem chance de falhar**

```sql
select produto_id,
       lower(trim(descricao))    as descricao_normalizada,
       count(*)                  as quantas,
       array_agg(id order by id) as ids
from apresentacoes
group by produto_id, lower(trim(descricao))
having count(*) > 1;
```

**Se voltar qualquer linha, pare.** O índice único da seção 9 vai falhar e derrubar a
transação inteira. Produção tem histórico real, então isto é bem mais provável aqui do
que foi no banco de testes. Para decidir qual duplicata apagar, use o bloco 3.1 de
`migracoes/03_saldo_inicial_e_apresentacao_unica.md`, que mostra saldo e movimentações
de cada uma. Me mande o resultado que eu monto a limpeza.

### 0.4 Policies que existem hoje — **a falha silenciosa**

```sql
select tablename, policyname, cmd, permissive
from pg_policies
where schemaname = 'public'
  and tablename in ('locais', 'estoques', 'movimentacoes',
                    'produtos', 'apresentacoes', 'usuarios_locais')
order by tablename, cmd, policyname;
```

Policies do mesmo comando são combinadas com **OU**. Uma policy antiga de SELECT que
este script não conheça pelo nome sobrevive e continua liberando tudo — e a migração
"passa" sem erro nenhum, com a restrição por local desligada na prática.

O script derruba, pelo nome exato:

| Tabela | Policy antiga que é derrubada |
|---|---|
| `locais` | `autenticados podem ler locais`, `ativos podem inserir locais` |
| `estoques` | `autenticados podem ler estoques`, `ativos podem inserir estoques` |
| `movimentacoes` | `autenticados podem ler movimentacoes`, `ativos podem inserir movimentacoes` |
| `produtos` | `ativos podem inserir produtos` |
| `apresentacoes` | `ativos podem inserir apresentacoes` |

Compare com o resultado da consulta. **Qualquer nome de SELECT ou INSERT nessas cinco
tabelas fora dessa lista precisa ser tratado** — me mande a lista antes de rodar.

### 0.5 O ajuste já foi aplicado em produção?

```sql
select pg_get_viewdef('vw_consumo_30_dias', true) like '%ajuste%' as ja_exclui_ajuste;
```

Só informativo — a seção 1 corrige nos dois casos. `false` confirma a suspeita de que o
`migracao_ajuste_estoque.sql` ficou para trás.

---

## Parte 1 — O script

Roda inteiro dentro de **uma transação**: se qualquer comando falhar, nada é aplicado e
produção fica exatamente como estava. DDL no Postgres é transacional, então isso vale
para tabelas, funções, policies e índices igualmente.

> Se o SQL Editor reclamar de `there is already a transaction in progress`, é aviso, não
> erro — pode seguir. Se preferir, remova o `begin;`/`commit;` e rode as seções na ordem.

```sql
begin;
```

### 1. Pendência da feature de ajuste

A view deixa de contar ajuste como consumo, e o motivo passa a existir com certeza. Os
dois são idempotentes.

```sql
create or replace view vw_consumo_30_dias as
with consumo as (
  select
    e.local_id,
    a.produto_id,
    a.unidade_id,
    sum(m.quantidade * a.quantidade_unitaria) as consumo_base
  from movimentacoes m
  join estoques      e  on e.id = m.estoque_id
  join apresentacoes a  on a.id = e.apresentacao_id
  left join motivos_movimentacao mo on mo.id = m.motivo_id
  where m.tipo  = 'saida'
    and (mo.codigo is null or mo.codigo not in ('descarte', 'ajuste'))
    and m.data >= now() - interval '30 days'
  group by e.local_id, a.produto_id, a.unidade_id
),
saldo as (
  select
    e.local_id,
    a.produto_id,
    a.unidade_id,
    sum(e.quantidade_atual)                         as embalagens,
    sum(e.quantidade_atual * a.quantidade_unitaria) as estoque_base,
    sum(e.estoque_minimo   * a.quantidade_unitaria) as minimo_base
  from estoques      e
  join apresentacoes a on a.id = e.apresentacao_id
  group by e.local_id, a.produto_id, a.unidade_id
)
select
  p.id                                   as produto_id,
  p.nome                                 as produto,
  c.nome                                 as categoria,
  u.sigla                                as unidade,
  l.id                                   as local_id,
  l.nome                                 as local,
  round(coalesce(co.consumo_base, 0), 4) as consumo_total_unidade_base,
  s.embalagens                           as estoque_atual_unidades,
  round(s.estoque_base, 4)               as estoque_atual_unidade_base,
  round(s.minimo_base, 4)                as estoque_minimo_unidade_base
from saldo s
join produtos        p on p.id = s.produto_id
left join categorias c on c.id = p.categoria_id
join locais          l on l.id = s.local_id
join unidades        u on u.id = s.unidade_id
left join consumo   co on co.produto_id = s.produto_id
                      and co.local_id   = s.local_id
                      and co.unidade_id = s.unidade_id;

insert into motivos_movimentacao (codigo, descricao)
values ('ajuste', 'Ajuste de inventário')
on conflict (codigo) do nothing;
```

### 2. Estrutura de acesso por local

```sql
create table if not exists usuarios_locais (
  usuario_id  uuid        not null,
  local_id    int         not null,
  pode_editar boolean     not null default false,
  criado_em   timestamptz not null default now(),
  criado_por  uuid,

  constraint usuarios_locais_pk
    primary key (usuario_id, local_id),

  constraint usuarios_locais_usuario_fk
    foreign key (usuario_id) references perfis(id) on delete cascade,

  constraint usuarios_locais_local_fk
    foreign key (local_id) references locais(id) on delete cascade,

  constraint usuarios_locais_criado_por_fk
    foreign key (criado_por) references perfis(id) on delete set null
);

create index if not exists idx_usuarios_locais_local
  on usuarios_locais(local_id);

comment on table  usuarios_locais             is 'Quais locais cada usuário acessa e se pode gerenciar o estoque deles. Administradores não precisam de linhas aqui — fn_is_admin() concede acesso total.';
comment on column usuarios_locais.pode_editar is 'false = somente leitura (visualizador). true = pode movimentar estoque e editar o mínimo neste local.';
comment on column usuarios_locais.criado_por  is 'Admin que concedeu o acesso. Null quando veio da migração inicial.';
```

As três funções são `security definer` de propósito: precisam ler `usuarios_locais`
ignorando o RLS da própria tabela, senão a checagem entraria em recursão.

```sql
create or replace function fn_pode_ver_local(p_local_id int)
returns boolean language sql security definer stable as $$
  select fn_is_ativo() and (
    fn_is_admin() or exists (
      select 1 from usuarios_locais
      where usuario_id = auth.uid()
        and local_id   = p_local_id
    )
  );
$$;

comment on function fn_pode_ver_local(int) is
  'Retorna true se o usuário logado pode visualizar dados do local informado. Exige perfil ativo.';

create or replace function fn_pode_editar_local(p_local_id int)
returns boolean language sql security definer stable as $$
  select fn_is_ativo() and (
    fn_is_admin() or exists (
      select 1 from usuarios_locais
      where usuario_id  = auth.uid()
        and local_id    = p_local_id
        and pode_editar
    )
  );
$$;

comment on function fn_pode_editar_local(int) is
  'Retorna true se o usuário logado pode alterar estoque do local informado.';

create or replace function fn_pode_editar_algum_local()
returns boolean language sql security definer stable as $$
  select fn_is_ativo() and (
    fn_is_admin() or exists (
      select 1 from usuarios_locais
      where usuario_id = auth.uid()
        and pode_editar
    )
  );
$$;

comment on function fn_pode_editar_algum_local() is
  'Retorna true se o usuário logado gerencia estoque em ao menos um local. Usada nas policies de produtos e apresentacoes, que são dados globais sem local_id.';
```

O `grant` não é decorativo. As outras tabelas herdaram os privilégios padrão do Supabase
na criação do projeto; uma tabela criada por migração não herda nada, e sem ele o
Postgres barra antes de avaliar o RLS, com
`42501: permission denied for table usuarios_locais`.

```sql
grant select, insert, update, delete
  on public.usuarios_locais to authenticated;

alter table usuarios_locais enable row level security;

drop policy if exists "usuario ve seus proprios acessos" on usuarios_locais;
create policy "usuario ve seus proprios acessos"
  on usuarios_locais for select to authenticated
  using (usuario_id = auth.uid() or fn_is_admin());

drop policy if exists "admin gerencia acessos" on usuarios_locais;
create policy "admin gerencia acessos"
  on usuarios_locais for all to authenticated
  using (fn_is_admin())
  with check (fn_is_admin());
```

### 3. Backfill — preserva o acesso de quem já usa o sistema

Todo não-admin recebe gestão de todos os locais, que é exatamente o que ele já tinha
antes desta migração. **Ninguém perde acesso no instante em que o script roda.** Depois
disso o admin restringe pela aba Acessos, com o sistema no ar.

```sql
insert into usuarios_locais (usuario_id, local_id, pode_editar)
select p.id, l.id, true
from perfis p
cross join locais l
where p.is_admin = false
on conflict (usuario_id, local_id) do nothing;
```

### 4. Leitura restrita ao local

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

### 5. Escrita exige gestão do local

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

Criar local vira exclusivo de admin. É **mudança de comportamento**: hoje qualquer
usuário ativo consegue. O motivo é que quem cria não recebe acesso automático (não ganha
linha em `usuarios_locais`), então o local sumiria da tela dele no instante seguinte.

```sql
drop policy if exists "ativos podem inserir locais" on locais;
create policy "admin pode inserir locais"
  on locais for insert to authenticated
  with check (fn_is_admin());
```

Movimentações: exige gestão do local e mantém o ajuste restrito a admin. Esta é a policy
que substitui a do `migracao_ajuste_estoque.sql`, com a regra do ajuste preservada — o
`fn_is_ativo()` de lá está embutido dentro do `fn_pode_editar_local()`.

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

### 6. Estoque mínimo por função, não por UPDATE na tabela

RLS é por linha, não por coluna. Dar UPDATE em `estoques` a um gerente daria junto o
poder de reescrever `quantidade_atual` por fora do histórico de movimentações.

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

### 7. Views param de furar o RLS

`vw_sugestao_compra` lê de `vw_consumo_30_dias`: as duas precisam do flag. Se só a
externa receber, a interna continua rodando como dona e o filtro não propaga.

```sql
alter view vw_consumo_30_dias         set (security_invoker = on);
alter view vw_sugestao_compra         set (security_invoker = on);
alter view vw_auditoria_movimentacoes set (security_invoker = on);
```

### 8. Saldo inicial com motivo próprio

Corrige o bug em que não-admin não conseguia cadastrar produto com quantidade inicial
maior que zero: a RPC gravava o saldo com motivo `ajuste`, que a policy da seção 5
restringe a admin.

```sql
insert into motivos_movimentacao (codigo, descricao)
values ('saldo_inicial', 'Saldo inicial do cadastro')
on conflict (codigo) do nothing;

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

### 9. Unicidade de apresentação

Falha se a Parte 0.3 tiver voltado alguma linha.

```sql
create unique index if not exists idx_apresentacoes_descricao_unica
  on apresentacoes (produto_id, lower(trim(descricao)));

comment on index idx_apresentacoes_descricao_unica is
  'Impede duas apresentações com a mesma descrição no mesmo produto, ignorando caixa e espaços nas pontas.';
```

### 10. RPC de apresentações em produto que já existe

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

```sql
commit;
```

---

## Parte 2 — Conferência

Rode depois do `commit`.

### 2.1 Tudo no lugar

```sql
select
  (select count(*) from pg_proc
     where proname in ('fn_pode_ver_local', 'fn_pode_editar_local',
                       'fn_pode_editar_algum_local', 'fn_define_estoque_minimo',
                       'fn_adiciona_apresentacoes_produto'))          as funcoes,
  (select count(*) from usuarios_locais)                              as acessos_criados,
  (select count(*) from motivos_movimentacao
     where codigo in ('ajuste', 'saldo_inicial'))                     as motivos,
  (select count(*) from pg_indexes
     where indexname = 'idx_apresentacoes_descricao_unica')           as indice_unico;
```

Esperado: `funcoes` = 5, `motivos` = 2, `indice_unico` = 1, e `acessos_criados` igual a
não-admins × locais.

### 2.2 As três views com security_invoker

```sql
select c.relname,
       coalesce((select option_value
                   from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'off') as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('vw_consumo_30_dias', 'vw_sugestao_compra',
                    'vw_auditoria_movimentacoes');
```

As três precisam vir `on` ou `true`.

### 2.3 Nenhuma policy antiga sobrou

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('locais', 'estoques', 'movimentacoes', 'produtos', 'apresentacoes')
  and cmd in ('SELECT', 'INSERT')
order by tablename, cmd;
```

Compare com o resultado de 0.4: os nomes antigos têm que ter sumido.

### 2.4 O teste que importa — como um usuário real

```sql
-- Pegue o UUID de um não-admin
select id, nome from perfis where is_admin = false order by nome;
```

Como o backfill deu acesso a tudo, os números abaixo devem bater com o total. Para
provar que a restrição funciona, o segundo bloco remove um acesso dentro da transação e
desfaz no `rollback`.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select count(*) as locais_visiveis   from locais;
  select count(*) as estoques_visiveis from estoques;
  select count(*) as auditoria_visivel from vw_auditoria_movimentacoes;
rollback;
```

```sql
begin;
  delete from usuarios_locais
   where usuario_id = 'COLE-O-UUID-AQUI'
     and local_id   = (select min(id) from locais);

  set local role authenticated;
  set local request.jwt.claims to '{"sub":"COLE-O-UUID-AQUI"}';

  select count(*) as locais_visiveis   from locais;
  select count(*) as auditoria_visivel from vw_auditoria_movimentacoes;
rollback;
```

Os dois têm que diminuir. Se `auditoria_visivel` **não** cair, o `security_invoker` da
seção 7 não pegou — e esse é exatamente o furo que ele fecha.

---

## Depois de rodar

1. **Publique o frontend** (`main`), se ainda não tiver publicado. Antes disso o app em
   produção não conhece `usuarios_locais` nem as RPCs novas. Não quebra, porque o
   backfill mantém todo mundo com acesso total, mas a aba Acessos ainda não existe.
2. **Configure os acessos** em Configurações → Acessos. Até fazer isso, todo não-admin
   continua gerenciando todos os locais, que é o estado de hoje.
3. **Opcional, sem pressa:** o bloco 4 de
   `migracoes/03_saldo_inicial_e_apresentacao_unica.md` reclassifica movimentações
   históricas de saldo inicial que ficaram com motivo `ajuste`. É cosmético — não afeta
   cálculo nenhum, porque saldo inicial é entrada e o consumo só soma saídas. Exige
   conferir a prévia antes.

---

## Rollback

Só serve **antes** de o admin começar a restringir acessos. Depois disso, o
`drop table usuarios_locais` joga fora a configuração de quem acessa o quê.

```sql
begin;

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

-- Escrita volta a exigir só perfil ativo
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

-- Volta a policy do migracao_ajuste_estoque.sql, com a regra do ajuste preservada
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

-- Views voltam a rodar com a permissão da dona
alter view vw_consumo_30_dias         set (security_invoker = off);
alter view vw_sugestao_compra         set (security_invoker = off);
alter view vw_auditoria_movimentacoes set (security_invoker = off);

drop index    if exists idx_apresentacoes_descricao_unica;
drop function if exists fn_adiciona_apresentacoes_produto(int, jsonb);
drop function if exists fn_define_estoque_minimo(int, numeric);
drop function if exists fn_pode_editar_algum_local();
drop function if exists fn_pode_editar_local(int);
drop function if exists fn_pode_ver_local(int);
drop table    if exists usuarios_locais;

commit;
```

O rollback **não** desfaz a correção da view de consumo nem o motivo `saldo_inicial`.
Os dois são correções de bug independentes do acesso por local, e desfazê-los só traria
de volta problemas já resolvidos — a `fn_cria_produto_completo` continua apontando para
`saldo_inicial`, que segue existindo.
