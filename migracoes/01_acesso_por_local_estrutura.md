# Fase 1 — Acesso por local: estrutura

**Onde rodar:** SQL Editor do Supabase (banco de **TESTES**), executa como `postgres`.
**Impacto no app:** **nenhum.** Esta fase só cria tabela e funções — nenhuma policy
existente passa a usá-las ainda. O app continua se comportando exatamente como hoje.
**Idempotente:** pode rodar mais de uma vez sem quebrar.

Rode os blocos **na ordem**. O bloco 5 (backfill) precisa vir depois do 1.

---

## 1. Tabela `usuarios_locais`

Liga usuário a local e diz se o acesso é de leitura ou de gestão.
Admin não entra aqui — `fn_is_admin()` já dá acesso total.

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

> A PK composta `(usuario_id, local_id)` já impede acesso duplicado.
> `on delete cascade` nas duas FKs: apagar usuário ou local limpa os acessos sozinho.

---

## 2. `fn_pode_ver_local(int)`

Usuário enxerga o local se estiver ativo **e** for admin ou tiver linha em
`usuarios_locais`. Desativar um perfil corta leitura e escrita de uma vez.

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
```

---

## 3. `fn_pode_editar_local(int)`

Escrita em um local específico: movimentações, estoque mínimo, vincular apresentação.
Exige `fn_is_ativo()` — usuário desativado perde a escrita imediatamente.

```sql
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
```

---

## 4. `fn_pode_editar_algum_local()`

`produtos` e `apresentacoes` são dados **globais** — não têm `local_id`, então não há
local para checar. A regra é: quem gerencia estoque em algum lugar pode cadastrar
produto; visualizador puro, não.

```sql
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

> As três funções são `security definer` de propósito: precisam ler `usuarios_locais`
> ignorando o RLS da própria tabela, senão a checagem entraria em recursão.

---

## 5. Permissões e RLS da própria `usuarios_locais`

Duas camadas diferentes, e as duas são necessárias.

O `GRANT` diz se o role pode **tocar** na tabela; o RLS diz **quais linhas** ele vê.
O Postgres checa o grant primeiro — sem ele, as policies nem chegam a ser avaliadas e
o erro é `42501: permission denied for table usuarios_locais`. Tabelas criadas por
migração não herdam grant nenhum automaticamente.

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

---

## 6. Backfill — preserva o acesso de quem já usa o sistema

**Este bloco é obrigatório.** Sem ele, na hora que as policies da Fase 2 entrarem,
todo usuário não-admin fica sem acesso a nada.

Dá gestão total a todos os não-admins em todos os locais — ou seja, exatamente o que
eles já têm hoje. Restringir vem depois, local por local, pela tela de configurações.

```sql
insert into usuarios_locais (usuario_id, local_id, pode_editar)
select p.id, l.id, true
from perfis p
cross join locais l
where p.is_admin = false
on conflict (usuario_id, local_id) do nothing;
```

> Inclui locais inativos de propósito: se um local for reativado depois, o acesso
> continua lá. E não cria linha para admin — `fn_is_admin()` já resolve.

---

## 7. Conferência

Rode depois de tudo. Os resultados esperados estão anotados em cada bloco.

```sql
-- 7.1 Quantos acessos foram criados por usuário
select p.nome,
       p.is_admin,
       count(ul.local_id) as locais_com_acesso
from perfis p
left join usuarios_locais ul on ul.usuario_id = p.id
group by p.id, p.nome, p.is_admin
order by p.is_admin desc, p.nome;
-- Esperado: admin com 0; todo não-admin com o total de locais cadastrados.

-- 7.2 Total de locais, para comparar com o de cima
select count(*) as total_locais from locais;

-- 7.3 As três funções existem e retornam booleano
select fn_pode_ver_local(1)      as ver_local_1,
       fn_pode_editar_local(1)   as editar_local_1,
       fn_pode_editar_algum_local() as edita_algum;
-- Rodando como postgres no SQL Editor, auth.uid() é null:
-- o esperado aqui é false, false, false. Isso é normal e não indica erro —
-- só confirma que as funções compilaram. O teste real é pelo app.

-- 7.4 Grant para authenticated (sem isto o RLS nem é avaliado)
select privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name = 'usuarios_locais'
order by privilege_type;
-- Esperado: DELETE, INSERT, SELECT, UPDATE.

-- 7.5 RLS ligado e as duas policies no lugar
select policyname, cmd
from pg_policies
where tablename = 'usuarios_locais'
order by policyname;
-- Esperado: 2 linhas — "admin gerencia acessos" (ALL) e
-- "usuario ve seus proprios acessos" (SELECT).
```

---

## Atenção para depois

**Usuário novo nasce sem acesso nenhum.** O perfil é criado automaticamente no cadastro,
mas nenhuma linha em `usuarios_locais` é gerada junto. Isso é o padrão seguro e é
intencional — mas quer dizer que, a partir da Fase 2, todo usuário novo precisa receber
acesso do admin antes de conseguir usar o sistema. A tela de gestão de acessos (Fase 5)
resolve isso; até lá, o backfill do bloco 6 pode ser rodado de novo para novos usuários.

**Usuário inativo não vê mais nada — e o app ainda não avisa isso.** Com `fn_is_ativo()`
dentro de `fn_pode_ver_local`, desativar um perfil zera leitura e escrita. Só que o
`AuthContext` carrega o campo `ativo` (`src/contexts/AuthContext.jsx:21`) e não faz nada
com ele: o login passa normalmente e a pessoa cai num app vazio, com a TopBar dizendo
*"Nenhum local ativo — cadastre um local"* (`src/components/TopBar.jsx:25`), que é uma
mensagem enganosa nesse caso. Anotado para a Fase 3: bloquear na tela de login com
"Seu acesso foi desativado. Procure um administrador."

---

## Rollback

Fase 1 é puramente aditiva — desfazer é só apagar o que foi criado.

```sql
drop function if exists fn_pode_editar_algum_local();
drop function if exists fn_pode_editar_local(int);
drop function if exists fn_pode_ver_local(int);
drop table    if exists usuarios_locais;
```

> Só vale enquanto a Fase 2 não rodou. Depois que as policies passarem a chamar as
> funções, `drop function` falha por dependência — aí o rollback é o da Fase 2 primeiro.
