# Requisições — telas dedicadas (plano)

Continuação do `REQUISICOES_PLANO.md`, que cobriu o fluxo nascido na tela de
Movimentações. Aqui a ordem se inverte: **o pedido existe antes da entrega**.

Este arquivo é um plano com perguntas em aberto. A seção 3 é a que precisa de você; as
outras são o levantamento do que já existe e o que eu recomendo. Nada foi codado ainda.

---

## 1. O que já funciona sem tocar em nada

Vale começar por aqui porque é mais do que eu esperava, e muda o tamanho do trabalho.

**A RPC de entrega já serve o fluxo dedicado.** `fn_registra_saida_requisicao` procura o
item por `(requisicao_id, apresentacao_id, local_id)` — exatamente a chave do índice
único — e só cria se não achar. Entregar contra um item que o pedido criou cai no caminho
do "mesmo produto duas vezes", que é o reaproveitamento já testado na migração 08. A
`quantidade_solicitada` também não é tocada quando o item já existe, então o pedido
continua dizendo o que foi pedido mesmo depois de três entregas parciais.

**Entrega parcial já funciona.** `quantidade_entregue` é soma das movimentações do item,
não coluna, e `quantidade_solicitada` é fixa. Pedir 10, entregar 8 e depois 2 é o
comportamento natural do modelo, sem nenhuma alteração.

**O item sobrevive sem entrega.** `requisicao_itens` aponta para apresentação + local, e
não para a movimentação, justamente para poder existir com zero entregas. Era a decisão
63 do plano anterior, tomada pensando nestas telas.

**As views já entregam o que a tela precisa ler.** `vw_requisicoes` tem número, datas,
responsáveis e contagem de itens visíveis; `vw_requisicao_itens` tem solicitada,
entregue, produto, apresentação, unidade e local.

Então o trabalho é **quase todo de tela**. O banco entra por três coisas pequenas, e cada
uma depende de uma resposta sua na seção 3.

---

## 2. O que falta no modelo

| | O que falta | Depende de |
|---|---|---|
| 1 | Coluna `data` em `requisicoes` — data do pedido escolhida à mão | Pergunta 3.5 |
| 2 | Encerrar um pedido com item não entregue | Pergunta 3.1 |
| 3 | Gerente editar e excluir item do próprio pedido | Pergunta 3.4 |
| 4 | Distinguir item pedido de item entregue por fora | Pergunta 3.3 |

Nenhuma dessas mexe em dado existente, e nenhuma mexe em saldo.

---

## 3. Perguntas em aberto

### 3.1 Status da requisição: derivar ou guardar?

A tela de lista precisa separar aberta de concluída. Dá para derivar: concluída é toda
requisição cujos itens têm `entregue >= solicitada`. O projeto prefere derivar, e com
razão — é o motivo de `quantidade_entregue` não ser coluna, e o comentário do schema diz
por quê: `estoques.quantidade_atual` já ensinou o preço de manter cache à mão.

Só que tem um caso que a derivação não consegue expressar: **"pedi 10, só tinha 8, está
encerrada assim"**. Derivando, essa requisição fica aberta para sempre, e a lista de
pendências enche de pedido que ninguém vai mais atender.

**Minha recomendação:** uma coluna `fechada_em timestamptz` em `requisicoes`, nula
enquanto aberta. É a decisão de encerrar, que é informação nova, e não a soma, que o banco
já sabe. A leitura "parcial ou total" continua derivada dos itens — guardar um `status`
com `'parcial'` e `'concluida'` seria duplicar o que as somas já dizem, e essas duas
verdades divergem no dia em que alguém excluir uma movimentação.

**A alternativa**, se você preferir zero coluna nova: a lista separa por "tem item
pendente" e quem quiser tirar um pedido morto da frente exclui a requisição. Funciona,
mas perde o histórico do que foi pedido e não atendido — que é informação que você
mencionou querer guardar.

### 3.2 Entregar mais do que o pedido: bloquear, avisar ou deixar?

Hoje nada impede. Pediu 10, o operador entrega 12, e a tela mostra entregue 12 sobre
solicitada 10.

**Minha recomendação: avisar e deixar passar.** O caso real é comum — chegou caixa fechada
de 12, o operador levou 12 — e bloquear não faz a realidade mudar: faz o operador lançar a
sobra **sem requisição**, e aí o vínculo se perde, que é pior do que um número
desconfortável. A tela mostra o excedente em âmbar, como já faz com os resultados
cortados do combobox.

Se você quiser bloquear, não dá para ser check constraint: a entregue é soma de várias
linhas, então o lugar é um `raise` dentro da RPC. É barato, só é uma decisão com
consequência operacional.

### 3.3 Entregar um item que não está no pedido

Hoje a RPC **cria o item em silêncio** quando não acha. No fluxo de Movimentações isso é
exatamente o certo — o item nasce da entrega. No fluxo dedicado o mesmo comportamento tem
um efeito colateral: o item criado na hora recebe `quantidade_solicitada = quantidade
entregue`, então ele passa a **parecer que foi pedido**. O pedido original fica
reescrito por uma entrega.

**Minha recomendação:** deixar `quantidade_solicitada` aceitar nulo, com o significado
"não foi pedido, foi entregue por fora". Aí a tela mostra os itens do pedido e, separados,
os extras, e ninguém precisa adivinhar. É a mesma escolha do `motivo_id` anulável em
`movimentacoes`, onde nulo quer dizer algo e a tela mostra travessão.

**O custo honesto:** é a única alteração que mexe em constraint existente. Hoje a coluna é
`not null` com `check (quantidade_solicitada > 0)`; passaria a `check
(quantidade_solicitada is null or quantidade_solicitada > 0)`. Nenhuma linha existente
viola, então a migração não precisa tocar em dado.

**A alternativa:** bloquear a entrega de item fora do pedido no fluxo dedicado. Mais
simples no banco, mas empurra o operador para o fluxo de Movimentações para resolver, e
duas portas com regras diferentes para a mesma coisa é o tipo de armadilha que a gente
paga depois.

### 3.4 Quem pode editar o pedido

Hoje `update` e `delete` em `requisicao_itens` e em `requisicoes` são **só de admin**. A
tela de pedido precisa que o gerente corrija o que ele mesmo digitou — mudar de 10 para 8,
tirar uma linha.

O problema conhecido é que **RLS é por linha, não por coluna**: liberar `update` em
`requisicao_itens` para o gerente libera junto a troca de `local_id`, isto é, mover um item
para um local que ele não gerencia. O projeto já enfrentou isso duas vezes, com duas
soluções diferentes:

- **Função `security definer`** — `fn_define_estoque_minimo`, criada exatamente porque
  conceder `update` em `estoques` daria de brinde o poder de reescrever
  `quantidade_atual`.
- **Trigger de proteção por coluna** — `tg_protege_perfil`, que barra `is_admin`, `ativo`
  e `papel_id` por nome, numa lista de negação.

**Minha recomendação: o trigger.** As policies de `update` e `delete` passam a
`fn_pode_editar_local(local_id)`, e um `tg_protege_requisicao_item` barra alteração de
`requisicao_id`, `apresentacao_id` e `local_id` para quem não é admin. O motivo de preferir
ao `security definer`: a tela de pedido precisa de **update e delete**, e amanhã de edição
em lote; uma função por operação não escala, e cada função nova é mais uma superfície para
esquecer uma checagem. O trigger vale para qualquer caminho, inclusive chamada direta à
API.

**Decisão separada, e é sua:** o gerente pode **excluir** item do pedido, ou só zerar a
quantidade? Excluir perde o registro de que foi pedido. Eu zeraria — mas isso conflita com
a `check (quantidade_solicitada > 0)`, então na prática "zerar" é excluir mesmo, a menos
que a 3.3 libere o nulo.

### 3.5 A coluna `data` e o que ordena as listas

`criado_em` é auditoria e não deve ser reescrito — está no comentário da tabela. Então a
data escolhida à mão quer coluna própria, como combinamos.

**Minha recomendação:** `data timestamptz not null default now()`, com o mesmo significado
que `movimentacoes.data` já tem: o instante do evento real, que pode diferir do
`criado_em`. E a lista de requisições ordena por `data desc`, não por `atualizado_em` —
`atualizado_em` existe para o modal de "requisição existente", onde o que importa é o que
foi mexido por último.

**Cuidado que eu quero registrar aqui:** o campo de data desta tela tem que usar o
`src/lib/datas.js`, nunca `new Date().toISOString()`. Foi esse exato erro que gravou 607
movimentações três horas adiantadas, e o campo novo é da mesma espécie — um
`datetime-local` que lê o valor como local.

### 3.6 Pedido que cruza locais: quem monta?

Uma requisição cruza locais por desenho, mas `insert` em `requisicao_itens` exige
`fn_pode_editar_local(local_id)`. Então o gerente da Cozinha só consegue pôr itens da
Cozinha, e um pedido que cruza locais precisa de duas pessoas ou de um admin.

**Minha recomendação:** manter, e a tela ser honesta a respeito — o seletor de local no
item mostra só os locais que o usuário pode editar, e um texto explica que itens de outro
local são adicionados por quem o gerencia. É o RLS fazendo o que existe para fazer, e
mudar isso é mudar o modelo de acesso, não a tela.

Se você quiser que um gerente monte o pedido inteiro, inclusive de local alheio, é uma
decisão de modelo de acesso e precisa de conversa própria — não é ajuste de tela.

### 3.7 Onde a entrega acontece

Duas formas:

**(a) A entrega continua em Movimentações.** A tela da requisição tem um botão "entregar"
que abre Movimentações já vinculada àquele número. **É a minha recomendação.** Movimentações
já tem combobox de produto, saldo do local, motivo, validação de saldo negativo e o
teclado inteiro pensado — repetir isso numa segunda tela é exatamente como nasceram as
cópias divergentes de `Label` e `SectionHeader`.

**(b) A tela da requisição entrega por dentro**, com um campo de quantidade por item.
Menos cliques para quem entrega um pedido de 15 itens de uma vez, e é um argumento de
verdade. Mas duplica a validação de saldo, e divergência de validação é pior que
divergência de visual: uma deixa gravar o que a outra barra.

Um meio: (a) agora, e (b) depois, como "entrega em lote", se o uso mostrar que vale.

---

## 4. As telas, se as respostas forem as que eu recomendo

**Lista de requisições** (`/requisicoes`) — tabela com número, data, responsáveis, itens,
e uma coluna de progresso ("8 de 10"). Filtro por aberta/encerrada e por número. Botão
"nova requisição".

**Tela da requisição** (`/requisicoes/:id`) — cabeçalho com número, data editável,
responsáveis; lista de itens com solicitada, entregue e saldo a entregar; os extras
separados; botões "adicionar item", "entregar" (leva para Movimentações vinculada) e
"encerrar".

**Movimentações** — ganha a terceira opção de requisição funcionando de verdade. Hoje
"Requisição existente" abre o modal e lista as requisições; passa a aceitar também chegar
já vinculada pela tela da requisição, via rota.

Reaproveitamento: `CartaoOpcao`, `Label`, `SectionHeader`, `TabelaCrud` (talvez não — o
CRUD genérico é para tabela de cadastro simples, e a lista de itens tem colunas
calculadas), `useCarregamento`, `datas.js`, `traduzErro`, e o combobox de produto, que
hoje está dentro de `Movimentacoes.jsx` e precisaria sair para um componente próprio se a
resposta da 3.7 for (b).

---

## 5. Banco — migração 10

Conteúdo, se as recomendações forem aceitas:

1. `requisicoes.data timestamptz not null default now()` + comentário distinguindo de
   `criado_em`
2. `requisicoes.fechada_em timestamptz` nula
3. `requisicao_itens.quantidade_solicitada` passa a aceitar nulo, e o check vira
   `is null or > 0`
4. Policies de `update`/`delete` em `requisicoes` e `requisicao_itens` por local, em vez
   de só admin
5. `tg_protege_requisicao_item`, barrando `requisicao_id`, `apresentacao_id` e `local_id`
   para não-admin
6. `vw_requisicoes` ganha `data`, `fechada_em` e as somas de solicitada e entregue —
   **com `with (security_invoker = on)` dentro do `create or replace`**, pela lição da 09
7. Aviso sobre a sequence: os testes em `begin/rollback` queimam número de requisição, só
   no banco de testes

Itens 1 e 2 são aditivos puros. O item 3 é o único que mexe em constraint existente. O 4 e
o 5 andam juntos e não devem ser separados em dois commits — policy relaxada sem o trigger
é uma janela aberta.

---

## 6. Ordem que eu sugiro

1. Você responde a seção 3
2. Migração 10, com os testes, e você roda no banco de testes
3. Lista de requisições (a tela mais simples, e já dá valor sozinha: hoje não há onde ver
   as requisições fora do modal)
4. Tela da requisição, sem o encerrar
5. Encerrar, extras e o vínculo com Movimentações
6. Teste, e aí produção

Os passos 3 a 5 são commits separados na mesma branch, cada um com a tela funcionando.
