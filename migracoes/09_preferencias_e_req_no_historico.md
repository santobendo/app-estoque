# Migração 09 — Preferências do usuário e requisição no histórico

Rode no **banco de testes** primeiro. As duas partes são independentes e cada uma é um
bloco único: copie a parte inteira de uma vez. Não divida um bloco em vários "Run" — o
SQL Editor abre uma conexão nova por execução, e um `begin;` sozinho fica órfão e volta
atrás (foi o que aconteceu na migração 05).

Duas coisas sem relação entre si, juntas porque são as duas pendências da requisição que
tocam o banco:

- **`perfis.preferencia_requisicao`** — com qual opção a tela de Movimentações abre.
  Preferência de cada usuário, não parâmetro do sistema: por isso é coluna em `perfis`
  e não tabela nova (ver a nota no fim do arquivo).
- **`requisicao_id` em `vw_auditoria_movimentacoes`** — para o Histórico mostrar de qual
  requisição veio a baixa. A coluna de ligação já existia em `movimentacoes`; a view é
  que não a expunha.

Nenhuma das duas mexe em dado existente: a coluna nasce com default e a view é
recalculada a cada leitura. **Não há risco para saldos nem para o histórico.**

Diferente da migração 08, os testes daqui **não queimam ids de sequence** — não criam
requisição nem movimentação. Podem rodar em qualquer banco, inclusive produção, se você
quiser conferir depois de aplicar.

---

## Parte 1 — preferência do usuário

```sql
begin;

-- -----------------------------------------------------------------
-- preferencia_requisicao — com qual opção a tela de Movimentações abre.
--
-- O prefixo "preferencia_" existe para agrupar: quando o tema seguir a pessoa
-- entre aparelhos, ele entra como preferencia_tema ao lado desta coluna, e um
-- \d perfis mostra as preferências juntas.
--
-- Só 'sem' e 'nova'. 'existente' é a terceira opção da tela, mas não é estado
-- em que a tela possa ABRIR: significa "comece de uma requisição que eu ainda
-- não escolhi", e a validação recusaria a gravação até o usuário escolher uma.
-- Liberar depois é relaxar este check, sem tocar em dado.
-- -----------------------------------------------------------------
alter table perfis
  add column preferencia_requisicao text not null default 'sem';

alter table perfis
  add constraint perfis_preferencia_requisicao_check
    check (preferencia_requisicao in ('sem', 'nova'));

comment on column perfis.preferencia_requisicao is
  'Preferência do usuário: com qual opção de requisição a tela de Movimentações abre. sem = como era antes; nova = já começa uma requisição. Preferência individual, não parâmetro do sistema.';

commit;
```

Não precisa de policy nem de grant novos, e isso não é sorte — é como `perfis` já estava
desenhada:

- a policy `"usuario edita proprio perfil"` já permite `update` na própria linha
  (`using (id = auth.uid())`);
- o trigger `tg_protege_perfil` barra **por nome** as três colunas sensíveis
  (`is_admin`, `ativo`, `papel_id`). É lista de negação, então a coluna nova fica
  editável pelo dono e por mais ninguém, sem alterar o trigger;
- `perfis` tem o grant padrão do Supabase (tabela criada na origem do projeto, não por
  migração), e grant é por tabela, não por coluna.

---

## Parte 2 — requisição na view de auditoria

```sql
begin;

-- -----------------------------------------------------------------
-- vw_auditoria_movimentacoes + requisicao_id
--
-- requisicao_id entra como ÚLTIMA coluna, depois de "busca", e isso não é
-- estética: create or replace view não deixa mudar nome, tipo nem ORDEM das
-- colunas existentes — só acrescentar no fim. Colocá-la no meio exigiria
-- drop + create, e o drop levaria embora o grant da view, que é justamente o
-- 42501 que apareceu na migração 08.
--
-- O join é left porque requisicao_item_id é null na movimentação comum, que
-- continua sendo o caso normal. E é no máximo 1:1 — ri.id é chave primária —
-- então a view não multiplica linha nenhuma: o Histórico continua paginando
-- de 20 em 20 sobre a mesma contagem.
--
-- RLS: a view é security_invoker, então o join também passa pelo RLS de
-- requisicao_itens, que é fn_pode_ver_local(local_id). Não há como ver a
-- movimentação e não ver o item, porque fn_registra_saida_requisicao cria o
-- item com o local_id do próprio estoque da movimentação — os dois recortes
-- são o mesmo local.
-- -----------------------------------------------------------------
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
  l.id                                     as local_id,
  l.nome                                   as local,
  pf.nome                                  as usuario,
  pa.nome                                  as cargo_usuario,
  pf.is_admin                              as usuario_admin,
  -- Coluna de busca da tela de Histórico: os campos que ela pesquisa,
  -- concatenados, sem acento e em maiúsculas. Existe porque o ilike do
  -- Postgres não ignora acento ('acucar' ilike '%AÇÚCAR%' é falso) e a tela
  -- filtra no servidor, já que pagina de 20 em 20. O unaccent daqui e o
  -- normalizar() do JavaScript chegam ao mesmo resultado para as letras do
  -- português, que é o que mantém as duas pontas da busca de acordo.
  -- Sem índice de propósito: unaccent é STABLE, não IMMUTABLE, então indexar
  -- exigiria um wrapper imutável — não paga para o volume desta base.
  upper(extensions.unaccent(
    coalesce(p.nome, '') || ' ' ||
    coalesce(a.descricao, '') || ' ' ||
    coalesce(pf.nome, '')
  ))                                       as busca,
  -- Última de propósito: ver a nota acima sobre create or replace view.
  ri.requisicao_id                         as requisicao_id
from movimentacoes            m
join estoques                 e  on e.id  = m.estoque_id
join apresentacoes            a  on a.id  = e.apresentacao_id
join unidades                 u  on u.id  = a.unidade_id
join produtos                 p  on p.id  = a.produto_id
join locais                   l  on l.id  = e.local_id
join perfis                   pf on pf.id = m.criado_por
left join papeis              pa on pa.id = pf.papel_id
left join motivos_movimentacao mo on mo.id = m.motivo_id
left join requisicao_itens    ri on ri.id = m.requisicao_item_id
order by m.data desc;

comment on view vw_auditoria_movimentacoes is
  'Histórico completo de movimentações com produto, apresentação, local, usuário, cargo, motivo e requisição de origem. security_invoker: respeita o RLS por local do usuário logado.';

commit;
```

`create or replace` preserva o grant e a opção `security_invoker`, então **não** é preciso
repetir `grant select` nem `alter view ... set (security_invoker = on)`. O teste 3 abaixo
confere as duas coisas, porque "preservou" é promessa de documentação e já nos custou um
42501.

---

## Testes

Rode no banco de testes. Nenhum cria linha nova; o único que escreve é o teste 2, em
`begin/rollback`, e `perfis` não tem sequence para queimar.

### 1. Estrutura — um veredito só

```sql
select
  (select count(*) from information_schema.columns
    where table_name = 'perfis' and column_name = 'preferencia_requisicao')            as col_pref,
  (select count(*) from information_schema.columns
    where table_name = 'vw_auditoria_movimentacoes' and column_name = 'requisicao_id') as col_view,
  (select count(*) from pg_constraint
    where conname = 'perfis_preferencia_requisicao_check')                             as check_pref,
  (select count(*) from perfis where preferencia_requisicao <> 'sem')                  as fora_do_default,
  (select reloptions::text from pg_class
    where relname = 'vw_auditoria_movimentacoes')                                      as opcoes_view;
```

**Esperado:** `1 | 1 | 1 | 0 | {security_invoker=true}`

O `fora_do_default` em zero prova que a coluna nasceu uniforme — nenhum perfil ficou com
valor estranho, e nenhum ficou nulo, porque é `not null`.

### 2. O check recusa valor inválido

```sql
begin;

-- Vale: o dono mudando a própria preferência (aqui pelo SQL Editor, sem RLS).
update perfis set preferencia_requisicao = 'nova'
 where id = (select id from perfis order by criado_em limit 1);

select preferencia_requisicao as deve_ser_nova
  from perfis order by criado_em limit 1;

-- Não vale: 'existente' está fora do check por decisão, não por esquecimento.
do $$
begin
  update perfis set preferencia_requisicao = 'existente'
   where id = (select id from perfis order by criado_em limit 1);
  raise exception 'FALHOU: o check aceitou existente';
exception
  when check_violation then
    raise notice 'OK: check recusou existente';
end $$;

rollback;
```

**Esperado:** a consulta devolve `nova`, e a mensagem `OK: check recusou existente`
aparece em Notices. Se aparecer `FALHOU`, a constraint da Parte 1 não entrou.

### 3. A view mostra a requisição, e continua respeitando o RLS

```sql
select
  count(*)                                        as linhas,
  count(requisicao_id)                            as com_requisicao,
  count(*) - count(requisicao_id)                 as sem_requisicao
from vw_auditoria_movimentacoes;
```

**Esperado:** `linhas` igual ao total de movimentações que você já tinha — se esse número
mudou, o join multiplicou linha e a paginação do Histórico sairia errada. `com_requisicao`
igual ao número de movimentações com `requisicao_item_id` preenchido, que você confere
com:

```sql
select count(*) as esperado_com_requisicao
  from movimentacoes where requisicao_item_id is not null;
```

Os dois têm que bater.

### 4. Conferir pelo olho

```sql
select id, data, produto, motivo_descricao, requisicao_id
  from vw_auditoria_movimentacoes
 where requisicao_id is not null
 order by data desc
 limit 10;
```

**Esperado:** as baixas que você gravou por requisição, cada uma com o número que a tela
mostrou na hora. Duas saídas da mesma requisição aparecem com o mesmo `requisicao_id`.

---

## Rollback da migração

```sql
begin;

alter table perfis drop constraint if exists perfis_preferencia_requisicao_check;
alter table perfis drop column    if exists preferencia_requisicao;

-- A view precisa de drop + create: create or replace acrescenta coluna no
-- fim, mas não REMOVE coluna nenhuma. E o drop leva o grant embora, por isso
-- o grant volta explícito no fim deste bloco.
drop view if exists vw_auditoria_movimentacoes;

create view vw_auditoria_movimentacoes as
select
  m.id, m.data, m.tipo, m.quantidade,
  a.quantidade_unitaria,
  u.sigla       as unidade,
  mo.codigo     as motivo,
  mo.descricao  as motivo_descricao,
  p.nome        as produto,
  a.descricao   as apresentacao,
  l.id          as local_id,
  l.nome        as local,
  pf.nome       as usuario,
  pa.nome       as cargo_usuario,
  pf.is_admin   as usuario_admin,
  upper(extensions.unaccent(
    coalesce(p.nome, '') || ' ' ||
    coalesce(a.descricao, '') || ' ' ||
    coalesce(pf.nome, '')
  ))            as busca
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

alter view vw_auditoria_movimentacoes set (security_invoker = on);

grant select on public.vw_auditoria_movimentacoes to authenticated;

commit;
```

Não perde dado nenhum: a preferência volta ao padrão de antes (`'sem'`, que era constante
no código) e o vínculo com a requisição continua em `movimentacoes.requisicao_item_id` —
a view só deixa de mostrá-lo.

A tela, porém, quebra antes do rollback terminar de ser útil: o Histórico passa a pedir
`requisicao_id` no `select` e a tela de Preferências grava `preferencia_requisicao`. Se
reverter o banco, reverta o código junto.

---

## Nota — por que a preferência é coluna em `perfis`, e não tabela

Discutimos as duas formas e o custo em disco é o mesmo (dezenas de KB contra os 500 MB do
plano free), então a escolha é de estrutura:

- **A preferência é atributo da pessoa.** Depende do id do usuário e de mais nada. Tabela
  separada seria uma relação 1:1 com `perfis`, isto é, a mesma entidade partida em duas
  para ser juntada de volta em todo `select`.
- **Coluna tem tipo; chave/valor não.** O `check` acima recusa `'Nova'`, `'nova '` e
  qualquer outra coisa. Numa tabela `(chave text, valor text)` tudo isso entra e só
  quebra na tela.
- **Não existe linha ausente.** Com `not null default 'sem'`, todo perfil já tem valor no
  instante da migração. Tabela separada criaria o estado "usuário sem linha de
  preferência", e aí o default do default moraria no código.
- **Zero policy nova.** Ver a lista no fim da Parte 1. Tabela nova precisaria de grant,
  `enable row level security` e policies de select, insert e update — cinco coisas, três
  das quais já custaram um `42501` neste projeto.

**Parâmetro do sistema é outra coisa** e, quando aparecer, não cabe em `perfis`: é
decisão do admin para todos, não atributo de ninguém. Aí sim entra tabela — de **uma
linha com colunas tipadas**, `create table parametros (id boolean primary key default
true check (id), ...)`, nunca chave/valor. As duas convivem sem conflito porque são
coisas diferentes, não duas implementações da mesma.
