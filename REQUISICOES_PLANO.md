# Requisições — plano de implementação (fluxo alternativo)

Branch: `feature/requisicoes`. Ponto de partida: tag `v1.0.0`.

Escopo desta etapa: criar a requisição **a partir da tela de Movimentações**, como você
descreveu. As telas dedicadas vêm depois — mas o modelo de dados aqui já é desenhado
para elas, para não precisar de migração de novo quando chegarem.

---

## 1. Modelo de dados

Duas tabelas novas e uma coluna em `movimentacoes`.

```
requisicoes
  id             serial PK        -- é o "número"
  data           timestamptz      -- default now(); editável só nas telas dedicadas
  digitado_por   uuid not null    -- responsável pela digitação do pedido
  entregue_por   uuid not null    -- responsável pela entrega
  criado_em      timestamptz
  atualizado_em  timestamptz      -- ordena o modal "requisições existentes"

requisicao_itens
  id                    serial PK
  requisicao_id         int not null  -> requisicoes
  apresentacao_id       int not null  -> apresentacoes   -- o que foi pedido
  local_id              int           -> locais          -- onde foi/será entregue
  quantidade_solicitada numeric not null
  criado_em             timestamptz

movimentacoes
  + requisicao_item_id  int null -> requisicao_itens     -- a entrega
```

### Por que `quantidade_entregue` não é coluna

Você listou "quantidade entregue" entre os dados a guardar. Ela **existe**, mas como
soma das movimentações vinculadas ao item, não como campo gravado:

```sql
quantidade_entregue = sum(movimentacoes.quantidade)
                      where requisicao_item_id = item.id
```

O motivo é concreto e já nos morderam uma vez neste projeto: `estoques.quantidade_atual`
é um cache, e foi exatamente de onde veio o bug do "saldo nunca atualizava". Pior, hoje
o admin **pode excluir movimentação** — se `quantidade_entregue` fosse coluna, cada
exclusão precisaria de outro trigger para corrigi-la, e um esquecimento deixaria o
número mentindo para sempre. Derivada, ela se corrige sozinha.

Se a soma ficar lenta algum dia (não vai, no volume desta base), viramos uma view.

### Por que o item aponta para `apresentacao_id` + `local_id`, e não para a movimentação

Porque a tela dedicada vai criar o item **antes** de existir qualquer entrega: pedir 10
hoje, entregar 8 amanhã e 2 depois. O item tem que poder existir com zero movimentações,
e aceitar mais de uma. Se ele apontasse para a movimentação, o fluxo dedicado exigiria
remodelar.

No fluxo alternativo os dois nascem juntos, na mesma transação — é o mesmo modelo, só
usado de um jeito mais direto.

### Numeração

O `id` serial é o número, como você sugeriu. Se um dia quiserem número formatado
(`REQ-2026-0001`), isso entra como **coluna nova**, não como troca de chave primária —
fica barato depois.

---

## 2. A decisão que precisa da sua resposta

> **Quando a requisição é criada no banco?**

Você escreveu que ela é "aberta automaticamente pelo sistema ao entrar na tela" e que o
número "fica aparente". Tomado ao pé da letra, isso insere uma linha em `requisicoes`
no `useEffect` de entrada da tela. O problema:

Abrir Movimentações e sair sem registrar nada — conferir um saldo, trocar de local,
desistir — **cria uma requisição vazia**. Em uma semana de uso normal isso é dezenas de
requisições fantasma poluindo o modal de "requisições existentes", e furos na sequência
de números.

Três saídas:

| Opção | Como funciona | Custo |
|---|---|---|
| **A — criação tardia** (recomendada) | A seção mostra "Nova requisição" sem número. Na **primeira saída** gravada, a requisição é criada e o número aparece, e dali em diante é o mesmo | O número não existe antes do primeiro item |
| **B — criação imediata** | Como você descreveu, ao entrar na tela | Requisições vazias acumulam; precisa de limpeza periódica |
| **C — imediata com filtro** | Cria ao entrar, mas o modal só lista requisições que têm item | Lixo na tabela e furos na numeração, só escondidos |

Recomendo **A**: o número continua "aparente", só aparece a partir do primeiro item em
vez de antes dele. E nada de fantasma. Mas é sua chamada, porque muda o que você vê na
tela nos primeiros segundos.

---

## 3. Outras complicações previstas

### 3.1 Requisição cruza locais, mas o RLS é por local

Você definiu que uma requisição pode ter item no Almoxarifado e item na Cozinha. Isso
colide com o RLS: um gerente que só gerencia a Cozinha vai ver o quê?

Proposta:

- **Cabeçalho** (`requisicoes`) legível por qualquer usuário ativo. É o que torna o
  fluxo cruzado possível: o gerente da Cozinha precisa achar, no modal, a requisição que
  o gerente do Almoxarifado começou.
- **Itens** filtrados por local, pela cadeia que já existe. O gerente da Cozinha vê os
  itens dela e não vê os do Almoxarifado.

O que isso expõe: número, data e os dois nomes de responsáveis de requisições que não
têm nenhum item no local dele. Sem quantidade e sem produto. Me diga se está de bom
tamanho ou se prefere restringir.

### 3.2 A requisição ativa vive só na memória da tela

"Enquanto o usuário não sai da tela ou não muda o tipo" é estado de frontend. Um F5
acidental no meio de uma requisição de 15 itens começaria uma requisição nova, partindo
a original em duas.

Proposta: guardar o id da requisição ativa em `sessionStorage`, como o local já faz no
`localStorage`. Sobrevive ao F5 e morre ao fechar a aba. Trocar o tipo para entrada ou
ajuste limpa, como você especificou.

### 3.3 Mesmo produto duas vezes na mesma requisição

Nada impede registrar duas saídas do mesmo produto/local na mesma requisição. Aí a
quantidade solicitada seria perguntada duas vezes para o mesmo item, o que é estranho.

Proposta para esta etapa: **cada saída gera seu próprio item**. A requisição mostra o
produto duas vezes, o que é honesto — foram duas retiradas. A tela dedicada, que
trabalha item a item, pode consolidar depois. Alternativa, se preferir: detectar e somar
na entrega do item existente, mantendo a solicitada da primeira vez.

### 3.4 Excluir uma movimentação que pertence a uma requisição

O admin pode excluir movimentação desde a última versão. Se ela estava vinculada a um
item:

Proposta: `on delete set null` no `requisicao_item_id`. O item sobrevive com solicitada
preenchida e entregue zero — leitura honesta de "foi pedido e não foi entregue". Apagar
o item junto seria errado no fluxo dedicado, onde ele existe por conta própria.

### 3.5 Quantidade entregue divergindo da solicitada

É esperado (pediu 10, tinha 8). Não vou bloquear. A tela mostra as duas e, quando a
entrega passa da solicitada, um aviso visual discreto — sem impedir.

### 3.6 A tela de Movimentações já é a mais complexa do projeto

São 739 linhas, 5 dos 13 erros de lint do projeto, o aviso de `exhaustive-deps`
deliberado, o combobox com teclado, o bloqueio de somente-leitura e os toasts.
Empilhar a seção de requisição ali dentro piora o pior arquivo.

Proposta: a seção nova sai como componente próprio, `src/components/SecaoRequisicao.jsx`,
recebendo e devolvendo estado por props. A tela ganha uma linha, não cem.

---

## 4. Como fica a tela

A numeração das seções muda, porque a requisição entra antes do produto:

| Hoje | Depois (saída) | Depois (entrada/ajuste) |
|---|---|---|
| 1. Tipo de Movimentação | 1. Tipo de Movimentação | 1. Tipo de Movimentação |
| 2. Produto | **2. Requisição** | 2. Produto |
| 3. Detalhes | 3. Produto | 3. Detalhes |
| | 4. Detalhes | |

A seção 2 só aparece com **saída** selecionada. Dentro dela:

**Três botões** no padrão dos cartões da seção 1 — Nova requisição, Adicionar a uma
existente, Sem requisição. Default: a definir com você (ver decisão abaixo).

**Com requisição ativa**, a seção mostra:

- **Número** — grande, é a informação que o usuário confere
- **Data** — somente leitura, `now()`, como você pediu para o fluxo alternativo
- **Responsável pela digitação** — select para admin, texto fixo para os demais
- **Responsável pela entrega** — idem
- **Itens já lançados nesta requisição** — lista curta com produto, local e quantidades.
  Não estava no seu detalhamento, mas sem ela o usuário perde a conta do que já baixou
  numa requisição de 15 itens. Me diga se quer.

**Seção de detalhes** ganha o campo **Quantidade solicitada** ao lado da quantidade,
visível só quando há requisição ativa.

### O modal de requisição existente

Lista `id`, data, os dois responsáveis e a contagem de itens, ordenada por
`atualizado_em` desc. Campo de busca por número. Navegação por teclado, no mesmo padrão
do combobox de produto — você vai usar.

---

## 5. Banco: o que entra na migração 08

1. `create table requisicoes` + `requisicao_itens` + índices
2. `alter table movimentacoes add column requisicao_item_id`
3. `grant` explícito nas duas tabelas novas para `authenticated` — a lição da
   `usuarios_locais`, que foi criada por migração e não herdou privilégio nenhum
4. RLS e policies nas duas, conforme a decisão de 3.1
5. Trigger que atualiza `requisicoes.atualizado_em` ao inserir item, para o modal poder
   ordenar por alteração
6. `fn_registra_saida_requisicao(...)` — RPC `security invoker` que, em **uma
   transação**, cria a requisição (se for a primeira saída), cria o item e grava a
   movimentação. Mesmo desenho do `fn_cria_produto_completo`: se qualquer etapa falhar,
   nada é gravado
7. View `vw_requisicoes` com a quantidade entregue derivada, para as telas lerem sem
   repetir a soma

E a sincronização do `estoque_schema_normalizado.sql` no mesmo commit, como sempre.

---

## 6. Ordem de execução proposta

1. Migração 08 com a estrutura, e você roda no banco de testes
2. `SecaoRequisicao.jsx` com as três opções, sem gravar nada ainda
3. O modal de requisição existente
4. A RPC e a gravação de verdade
5. A lista de itens da requisição ativa na seção
6. Ajuste dos responsáveis para admin
7. Teste do fluxo cruzando locais, que é o caso que o RLS pode travar

Cada etapa dá para testar sozinha. A 1 é a única que precisa de SQL seu.

---

## 7. Resumo do que preciso de você

1. **Criação tardia ou imediata da requisição?** (seção 2) — é a que muda mais código
2. **Cabeçalho da requisição visível para todos?** (3.1)
3. **Qual das três opções vem selecionada por padrão** ao abrir a tela em saída? "Sem
   requisição" preserva o comportamento atual; "Nova requisição" assume que requisição
   passa a ser a regra
4. **Mostrar a lista de itens já lançados** na seção? (seção 4)
5. **Mesmo produto duas vezes:** dois itens ou somar no existente? (3.3)
