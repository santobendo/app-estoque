# Migrações

As migrações 01 a 07 foram aplicadas nos três bancos — testes e as duas instâncias de
produção — e o conteúdo delas já está consolidado no
**`estoque_schema_normalizado.sql`**, na raiz do projeto. Por isso foram removidas da
árvore de trabalho (veja como recuperá-las abaixo).

## Pendente

| Migração | Testes | Produção A | Produção B |
|---|---|---|---|
| `08_requisicoes.md` | — | — | — |

Rodar no banco de testes primeiro. A pasta volta a ficar vazia quando os três estiverem
em dia.

## Como criar um banco novo

Rode só o `estoque_schema_normalizado.sql` no SQL Editor do Supabase. Ele representa o
estado final do schema, com tudo que as migrações faziam — **inclusive as pendentes
acima**, que são sincronizadas nele no mesmo commit. Não há migração avulsa para aplicar
depois num banco criado do zero; a lista de pendências serve só para os bancos que já
existem.

Para popular com dados fictícios e conferir as telas, rode o `seed_demo.sql` em
seguida — nunca em produção.

## Como recuperar uma migração antiga

Nada foi perdido, só saiu da árvore de trabalho. O último commit em que os arquivos
existiram é o pai de `chore: remove as migracoes ja aplicadas`:

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

O que **não** está no schema são as receitas de teste. Duas são úteis o suficiente para
valer o `git show` quando chegar a hora:

- **Teste de RLS por usuário real** (seção 2.3 da migração 07): roda dentro de
  `begin/rollback` com `set local role authenticated` e `set local request.jwt.claims`,
  remove um acesso do usuário e confere que nenhuma linha de local alheio aparece. É o
  teste que prova o `security_invoker` das views.
- **Teste do saldo negativo** (seção 3.4 da migração 06): lança entrada, consome, e
  tenta excluir a entrada — o resultado esperado é erro, não sucesso.

## Convenção, daqui pra frente

Quando houver migração nova, ela entra aqui como `NN_descricao.md` e o
`estoque_schema_normalizado.sql` é sincronizado **no mesmo commit**. É isso que mantém
o arquivo de criação como fonte da verdade e permite esta pasta voltar a ficar vazia
depois que todos os bancos estiverem em dia.
