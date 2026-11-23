# Migrações

**Nenhuma migração pendente.** Os dois bancos estão em dia, e é por isso que esta pasta
está vazia.

| Migração | Testes | Produção A |
|---|---|---|
| _(nenhuma pendente)_ | — | — |

**São dois bancos:** testes e produção A. A produção B foi desativada em 11/2026 por não
estar mais em uso — as migrações 01 a 09 chegaram a ser aplicadas nela, mas ela não entra
mais nesta tabela. Migração nova roda **no banco de testes primeiro**.

As migrações **01 a 11** já estão consolidadas no **`estoque_schema_normalizado.sql`**, na
raiz do projeto, e por isso foram removidas da árvore de trabalho (veja como recuperá-las
abaixo). As duas últimas a sair foram a **10**, que preparou as telas dedicadas de
requisição (data, encerramento e observação no cabeçalho, `update`/`delete` por local, a
`vw_requisicoes` com os totais), e a **11**, que fechou o buraco que o teste da 10
revelou: `fechada_em` era rótulo, não estado, e pedido encerrado continuava aceitando item
e entrega. As duas rodaram em produção A em 23/11/2026.

Um aviso que a 11 deixou e que continua valendo: `create or replace view` **não** preserva
o `security_invoker`. O `estoque_schema_normalizado.sql` traz a explicação ao lado do
`alter view` da `vw_auditoria_movimentacoes`, e toda migração que mexer em qualquer das
cinco views precisa escrever a opção dentro do próprio `create`.

## Como criar um banco novo

Rode só o `estoque_schema_normalizado.sql` no SQL Editor do Supabase. Ele representa o
estado final do schema, com tudo que as migrações faziam — **inclusive as que ainda
estiverem pendentes acima**, porque são sincronizadas nele no mesmo commit. Não há
migração avulsa para aplicar depois num banco criado do zero; a lista de pendências
serve só para os bancos que já existem.

Para popular com dados fictícios e conferir as telas, rode o `seed_demo.sql` em
seguida — nunca em produção.

## Como recuperar uma migração antiga

Nada foi perdido, só saiu da árvore de trabalho. Cada arquivo viveu até o commit que o
removeu — `chore: remove as migracoes ja aplicadas` para as migrações 01 a 07, o
`chore: remove a migracao 08, ja aplicada nos tres bancos` para a 08, o commit que tirou
a 09 depois que ela rodou nos dois bancos, e `chore: remove as migracoes 10 e 11, ja
aplicadas nos dois bancos` para as duas últimas. O conteúdo está no pai desses commits:

```bash
# listar o que havia na pasta
git show <commit-anterior>:migracoes/

# restaurar um arquivo específico
git show <commit-anterior>:migracoes/07_busca_sem_acento.md > /tmp/07.md
```

Para achar o commit:

```bash
git log --oneline --diff-filter=D -- migracoes/
```

## O que vale recuperar, se precisar

O schema já carrega o **porquê** de cada decisão nos comentários — por que o estoque
mínimo passa por função em vez de policy de UPDATE, por que a reversão de saldo é
trigger e não RPC, por que as views precisam de `security_invoker`, e assim por diante.

O que **não** está no schema são as receitas de teste. Estas são úteis o suficiente para
valer o `git show` quando chegar a hora:

- **Teste de RLS por usuário real** (seção 2.3 da migração 07): roda dentro de
  `begin/rollback` com `set local role authenticated` e `set local request.jwt.claims`,
  remove um acesso do usuário e confere que nenhuma linha de local alheio aparece. É o
  teste que prova o `security_invoker` das views.
- **Teste do saldo negativo** (seção 3.4 da migração 06): lança entrada, consome, e
  tenta excluir a entrada — o resultado esperado é erro, não sucesso.
- **Testes da requisição** (migração 08): cinco blocos que exercitam o
  `fn_registra_saida_requisicao` com o RLS de um usuário de verdade — criação tardia do
  cabeçalho, reuso do item na segunda saída do mesmo produto, requisição cruzando
  locais, e o item que sobrevive com entregue = 0 quando a movimentação é excluída.
  Atenção: eles rodam em `begin/rollback` e não deixam linha, mas queimam ids da
  sequence — só em banco de testes.
- **Teste de preferência do usuário** (migração 09): confere que o `check` de
  `perfis.preferencia_requisicao` recusa valor fora da lista, e que a view de auditoria
  voltou com `{security_invoker=true}` em `reloptions`.
- **Testes de proteção por coluna** (testes 3 e 4 da migração 10): o gerente edita o
  próprio pedido, mas trocar responsável ou produto é recusado, e item com entrega não
  pode ser excluído por não-admin — cada um conferido primeiro como gerente e depois como
  admin, com a troca de role e de claims que a convenção abaixo descreve.
- **Teste do pedido encerrado** (teste 2 da migração 11): monta requisição, item e entrega
  de verdade, encerra, e confere seis vereditos — entrega recusada, item novo recusado,
  **o saldo do estoque intacto** (é o que prova que o `before insert` chegou antes do
  `tg_atualiza_estoque`), as duas operações aceitas depois de reabrir, e a movimentação
  sem requisição passando direto.

Vale também o **porquê** de duas decisões, guardado na nota de rodapé de cada uma: por
que `quantidade_solicitada` continua obrigatória em vez de distinguir "pedido" de
"entregue por fora do pedido" — decisão do Matheus em 11/11/2026, com os três casos reais
que a motivaram (nota da 10) — e onde fica a fronteira entre o que a tela garante por
cortesia e o que o banco garante por autoridade (nota da 11).

## Convenção, daqui pra frente

**Teste tem que devolver tabela.** O painel de resultado do SQL Editor não mostra
`raise notice`, então um teste feito de notices roda e parece não ter feito nada — foi o que
aconteceu com os testes 3 e 4 da migração 10, reescritos depois disso. Quando o teste
precisa de bloco `do` (para trocar de role, ou para capturar exceção), o jeito é juntar o
veredito numa `temp table` e terminar com um `select` dela. E o insert na temp table só
funciona com o role de volta ao normal: enquanto o role é `authenticated`, a tabela, que é
do `postgres`, recusa a escrita.

E trocar de usuário é **duas** configurações, não uma: `role` e `request.jwt.claims`. Voltar
só o `role` deixa `auth.uid()` devolvendo o usuário anterior, então tudo que vem depois
continua rodando com o RLS dele — e um trigger que olha `fn_is_admin()` continua vendo um
não-admin. Vale também encerrar cada escrita do teste dentro de `begin/exception`: teste que
aborta no meio não chega a mostrar o veredito.

Quando houver migração nova, ela entra aqui como `NN_descricao.md` e o
`estoque_schema_normalizado.sql` é sincronizado **no mesmo commit**. É isso que mantém
o arquivo de criação como fonte da verdade e permite esta pasta voltar a ficar vazia
depois que todos os bancos estiverem em dia.
