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
| 4 | ~~Distinguir item pedido de item entregue por fora~~ — descartado na 3.3 | — |

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

**Decidido (10/11/2026):** derivar o estado e guardar a decisão. `fechada_em timestamptz`
nula enquanto aberta; "parcial ou total" continua saindo das somas dos itens, e não entra
coluna `status`.

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

**Decidido (10/11/2026):** avisar e deixar passar. E mais um pedido do Matheus: um campo de
observações, para anotar por que foi entregue mais do que o pedido — ou qualquer outra
situação que mereça registro.

**Onde a observação fica.** Recomendo uma coluna só, `requisicoes.observacoes text` nula,
editada no cabeçalho da tela da requisição e sinalizada na lista quando tem conteúdo. Os
outros dois lugares possíveis custam mais do que entregam agora:

- Em `requisicao_itens`, uma nota por linha é mais precisa, mas o excedente nasce na
  *entrega*, não na linha: duas entregas do mesmo item, uma delas com sobra, disputariam o
  mesmo campo, e a segunda apagaria ou emendaria a nota da primeira.
- Em `movimentacoes` seria exato — uma nota por entrega — mas pede parâmetro novo na RPC,
  campo novo no formulário de Movimentações e coluna nova na tabela mais movimentada do
  banco. Caro para a primeira versão.

Com a coluna no cabeçalho a RPC não muda nada, e quem lê "12 de 10" em âmbar na tela da
requisição tem o porquê a dois centímetros do número — o aviso de excedente leva o foco
para o campo de observações. Se o uso mostrar que a nota precisa ser por linha,
`requisicao_itens.observacoes` entra depois, aditiva como esta.

**Consequência que o campo traz, e que eu não tinha previsto.** Editar o cabeçalho passa a
ser necessário para usuário comum, e hoje **não existe policy de `update` em `requisicoes`
para não-admin** — de propósito: dar `update` ali deixaria qualquer um trocar os
responsáveis de qualquer requisição. É o que diz o comentário de `fn_toca_requisicao`, que
por isso é `security definer`. Então a migração 10 precisa de duas coisas além do que eu
havia listado: um predicado para quem edita o cabeçalho, e o trigger de proteção cobrindo
também `requisicoes`, barrando `digitado_por` e `entregue_por` para não-admin. Predicado
que eu recomendo: existe item desta requisição em local que o usuário pode editar — é o
mesmo recorte que ele já vê, e não inventa dono para uma requisição que cruza locais.

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

**Exemplo, pedido pelo Matheus em 10/11/2026.** O caso não só acontece: no fluxo (a) da
3.7, que é o que vamos fazer, ele é o caminho *normal* da tela. A razão é que o combobox de
produto de Movimentações é livre — vincular a tela a uma requisição não limita a lista aos
itens do pedido. Três formas, da mais óbvia para a mais traiçoeira:

**1. O item que pedem no balcão.** A requisição #42 foi montada com Arroz 5kg — 10 e Óleo
900ml — 6. O estoquista entrega os dois em Movimentações, vinculado ao #42. Na hora, o
cozinheiro diz "leva 2 de sal também". O estoquista escolhe Sal 1kg na mesma tela, ainda no
#42, quantidade 2. A chave `(42, sal 1kg, Cozinha)` não existe, a RPC cria o item, e
`quantidade_solicitada` recebe o que o operador digitou no campo "quanto foi solicitado" —
2. Amanhã o gerente abre a #42 e lê "Sal 1kg — solicitado 2, entregue 2". Uma linha que
ninguém pôs no pedido, hoje indistinguível das que ele mesmo digitou.

**2. O erro de apresentação.** O pedido tem Arroz 5kg; o operador clica em Arroz 1kg.
Produto certo, apresentação errada, chave diferente — item novo. A #42 passa a mostrar
*duas* linhas de arroz: a de 5kg com solicitado 10 e entregue 0, e a de 1kg com solicitado
10 e entregue 10. Parece um pedido com duas linhas de arroz, uma delas não atendida. E não
há como dizer, olhando, que a segunda nunca foi pedida.

**3. O local.** `local_id` está na chave única, então entregar o mesmo produto a partir de
um local diferente do da linha do pedido também cria item novo. A linha da Cozinha fica em
entregue 0 e aparece uma linha do Depósito como se tivesse sido pedida.

Nos três o estrago é o mesmo, e é de leitura, não de saldo: o pedido original fica
reescrito por uma entrega, e ninguém consegue mais responder "isso foi pedido?". Com
`quantidade_solicitada` nula o banco passa a saber a diferença, e a tela mostra duas
seções — os itens do pedido e, abaixo, os entregues sem constar no pedido.

**Decidido (11/11/2026): não fazer.** `quantidade_solicitada` continua `not null`, e a
migração 10 saiu sem este item. A leitura do Matheus, caso por caso:

- **Caso 1, o item do balcão:** "tranquilo, isso é perfeito e também seria possível fazer
  se tivesse a baixa na tela de requisições. É prático, seguimos assim."
- **Caso 2, o erro de apresentação:** "é algo chato, mas no final é visto que foi entregue;
  o gerente ou adm pode excluir depois para ficar limpo."
- **Caso 3, o local:** "esse comportamento é bom, pois permite ver que o produto foi pedido
  em um local e talvez por falta foi retirado de outro."

Duas consequências para as telas, e vale escrever para ninguém esperar o contrário:

1. **Não existe seção de extras.** Todos os itens aparecem numa lista só, porque o banco
   não sabe separá-los.
2. **A limpeza do caso 2 é excluir a linha que NÃO tem entrega** — a do Arroz 5kg, que
   ficou em entregue 0. Essa exclusão não perde nada: nenhuma movimentação aponta para ela.
   Sobra a linha de Arroz 1kg com solicitado 10 e entregue 10, que é o que de fato
   aconteceu. Excluir a linha *entregue* é o contrário disso, e é o que o trigger da 3.4
   barra para não-admin.

Se um dia a distinção virar necessária, há um caminho que custa zero no schema: um item
criado pela entrega tem `criado_em` **exatamente igual** ao da sua primeira movimentação,
porque os dois nascem na mesma transação e o `now()` do Postgres é o instante da transação.
Um item criado pela tela de pedido nasce antes, em outra transação. Dá para derivar o
marcador na view, sem coluna nova e sem mexer em constraint.

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

**Decidido (10/11/2026):** o trigger, como recomendado. E a decisão separada se resolve
sozinha, se a 3.3 liberar o nulo:

- **Item sem nenhuma entrega:** excluir, e sem cerimônia. É a linha que o gerente digitou
  errado e tirou antes de alguém entregar; não há movimentação para perder vínculo, e o
  único registro que se perde é o do erro de digitação.
- **Item com entrega:** **não excluir.** `movimentacoes.requisicao_item_id` é `on delete
  set null`, então excluir o item **apaga em silêncio o vínculo da entrega com a
  requisição** — a coluna "Req" do Histórico, que acabou de entrar, ficaria em travessão
  para aquela saída. É a classe de perda calada que a gente vem evitando.

**Ajuste depois da resposta da 3.3 (11/11/2026).** Sem o nulo, não existe "tirar do pedido
sem excluir": o segundo caso deixa de ter saída elegante e passa a ser uma proibição. Ficou
assim na migração 10, dentro do `tg_protege_requisicao_item`:

- **não-admin** não exclui item que já tem entrega — a mensagem diz quantas entregas são e
  aponta o caminho sem perda, que é excluir a movimentação no Histórico primeiro (o
  `fn_reverte_estoque` devolve o saldo) e só então o item, que aí não tem mais entrega;
- **admin** exclui, porque é a válvula de escape de quem administra, e a tela avisa com o
  número de entregas antes de deixar.

O trigger dispara **também no cascade** de `requisicoes`, então um gerente não consegue
apagar a própria requisição se algo nela já foi entregue — que é o resultado certo: o
cascade apagaria todos aqueles vínculos de uma vez.

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

**Decidido (10/11/2026):** como recomendado — coluna `data` própria, listas por `data
desc`, e o campo usando `src/lib/datas.js`.

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

**Decidido (10/11/2026):** mantém-se o RLS. Palavra do Matheus: "um gerente só pode
adicionar itens de um local que ele gerencia, é assim que deve ser." A tela mostra só os
locais que o usuário pode editar e explica em texto que itens de outro local são
adicionados por quem os gerencia.

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

**Decidido (10/11/2026): (a) primeiro, nesta branch; (b) depois, em branch dedicada.** O
Matheus pediu honestidade sobre o custo de (b), e a primeira coisa honesta é uma correção
do que eu escrevi acima.

**O que eu exagerei.** Escrevi que (b) "duplica a validação de saldo" e que divergência de
validação "deixa gravar o que a outra barra". Fui conferir: `estoques` tem `check
(quantidade_atual >= 0)` e o trigger `fn_atualiza_estoque` subtrai no insert — então saída
maior que o saldo é **recusada pelo banco**, por qualquer caminho, inclusive chamada direta
à API. A validação de Movimentações (`Estoque insuficiente. Disponível: X`) é mensagem
amigável antes do envio, não é a autoridade. Logo (b) não consegue deixar passar o que (a)
barra: o que pode divergir é o texto do aviso e o momento em que ele aparece — divergência
de UX, não de dado. Isso baixa o risco de (b) de "perigoso" para "chato se esquecido".

**O que (b) realmente custa.** Escopado como *entrega em lote dos itens que já estão no
pedido* — e não como uma segunda tela de movimentação —, (b) **não precisa** do combobox de
produto, nem dos cartões de tipo, nem do modo ajuste, nem do bloco de responsáveis. Sobra
uma tabela com um campo de quantidade por linha. O custo real está em três pontos:

1. **Erro por linha.** O `erros` de Movimentações é um objeto achatado (`{quantidade:
   '...'}`) porque a tela grava uma movimentação por vez. Em lote o estado de erro passa a
   ser indexado por item, e cada campo que hoje recebe `erros.quantidade` passa a receber
   `erros[item.id]`. É o trabalho mais entediante dos três e o que mais convida a gambiarra
   se feito com pressa.
2. **Transação.** N chamadas à RPC são N transações: se a linha 7 falhar por saldo, as seis
   primeiras já estão gravadas e a tela tem que dizer exatamente quais foram e quais não. O
   alternativo é uma RPC de lote — `fn_registra_entrega_lote(p_itens jsonb, ...)` — que
   chama a de hoje num laço e é tudo ou nada: umas 30 linhas de PL/pgSQL, e deixa a tela
   muito mais simples ao custo de mais uma função no banco.
3. **`estoque_id` e saldo por linha.** O item do pedido sabe apresentação e local; a
   entrega precisa do `estoques.id` e do saldo de cada um. É uma consulta só, barata, mas é
   código que (a) não tem.

**Por que (a) primeiro, e não só por cautela.** (a) é necessário de qualquer forma: item
fora do pedido (3.3), saída solta sem requisição, ajuste e entrada moram em Movimentações e
continuam morando lá. O "entregar" da tela da requisição, em (a), é um botão que abre
Movimentações já vinculada ao número — uma rota e um parâmetro. Então (a) não é degrau que
se joga fora depois, é a porta que fica. E fazer (a) primeiro dá uma informação que hoje
ninguém tem: quantos itens um pedido real costuma ter. (b) paga a si mesmo num pedido de 15
linhas e é peso morto num de 2.

**O risco de manutenção de (b), sem rodeio:** o que pode envelhecer mal é a entrega existir
em dois lugares *com a regra de negócio em dois lugares* — por exemplo no dia em que entrar
"saída de descarte exige motivo". Essa regra teria que ser lembrada nas duas telas, e
esquecer uma é silencioso. A defesa é pôr a regra na RPC, que as duas chamam, e não na tela
— e é por isso que a RPC de lote do ponto 2 é a melhor forma de fazer (b): uma porta no
banco, duas telas magras em cima.

---

## 4. As telas, se as respostas forem as que eu recomendo

**Lista de requisições** (`/requisicoes`) — tabela com número, data, responsáveis, itens,
e uma coluna de progresso ("8 de 10"). Filtro por aberta/encerrada e por número. Botão
"nova requisição".

**Tela da requisição** (`/requisicoes/:id`) — cabeçalho com número, data editável,
responsáveis e o campo de observações; lista única de itens com solicitada, entregue e
saldo a entregar — sem seção de extras, pela 3.3; botões "adicionar item", "entregar" (leva
para Movimentações vinculada) e "encerrar". Excluir item que já tem entrega só aparece para
admin, e com aviso.

**Feita em 17/11/2026**, menos o "entregar" e o "encerrar", que são o passo 5. Três coisas
que a escrita decidiu e não estavam aqui:

- **Todo `update` e `delete` leva `.select()` junto.** O RLS recusa essas duas operações em
  silêncio — zero linhas afetadas, sem erro —, então sem isso a tela diria "salvo" quando
  nada foi salvo. O `insert` não tem esse problema: lá a recusa vem como 42501.
- **O `traduzErro` passou a deixar a mensagem dos triggers passar.** Ele devolvia "Você não
  tem permissão para esta operação" para todo 42501, o que apagava justamente o texto do
  `fn_protege_requisicao_item` — o que diz quantas entregas o item tem e manda excluir a
  movimentação no Histórico primeiro. Agora só a recusa de policy, que vem em inglês do
  Postgres, cai no texto genérico.
- **O combobox de produto saiu de `Movimentacoes.jsx`** para `components/ProdutoBusca.jsx`,
  porque "adicionar item" precisa do mesmo campo. A seção 4 previa isso só se a 3.7 fosse
  (b); o adicionar item antecipou.

E uma coisa que a tela **não** consegue dizer, e por isso não tenta: lista de itens vazia
pode ser pedido vazio ou pedido inteiro em local alheio. A `vw_requisicoes` é
`security_invoker`, então a contagem dela passa pelo mesmo RLS da consulta de itens e os
dois números são sempre iguais — não há de onde tirar a diferença.

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
3. ~~`requisicao_itens.quantidade_solicitada` passa a aceitar nulo~~ — **descartado**
   na resposta da 3.3; não entrou na migração 10
4. Policies de `update`/`delete` em `requisicoes` e `requisicao_itens` por local, em vez
   de só admin
5. `tg_protege_requisicao_item`, barrando `requisicao_id`, `apresentacao_id` e `local_id`
   para não-admin, e barrando a exclusão de item que já tem entrega
6. `vw_requisicoes` ganha `data`, `fechada_em`, `observacoes` e as somas de
   solicitada e entregue —
   **com `with (security_invoker = on)` dentro do `create or replace`**, pela lição da 09
7. Aviso sobre a sequence: os testes em `begin/rollback` queimam número de requisição, só
   no banco de testes
8. `requisicoes.observacoes text` nula (3.2), e a view mostrando-a
9. Policy de `update` em `requisicoes` para não-admin pelo predicado "tem item em local que
   eu posso editar", e o `tg_protege_requisicao` barrando `digitado_por` e `entregue_por` —
   vai junto com o 4 e o 5, no mesmo commit, pelo mesmo motivo

Itens 1, 2 e 8 são aditivos puros, e com o 3 descartado **nenhuma constraint existente é
alterada**. O 4, o 5 e o 9 andam juntos e não devem ser separados em commits diferentes —
policy relaxada sem o trigger é uma janela aberta; na migração escrita eles estão no mesmo
`begin/commit`, com os triggers antes das policies, então a janela não existe em instante
nenhum.

Entrou também, fora da lista original: **a RPC passa a datar o cabeçalho pela data da
movimentação que o criou** (`coalesce(p_data, now())`). Sem isso a coluna `data` mentiria no
caminho que cria quase toda requisição do sistema.

---

## 6. Ordem que eu sugiro

1. ~~Você responde a seção 3~~ — feito em 10 e 11/11/2026
2. ~~Migração 10, com os testes~~ — escrita em `migracoes/10_telas_requisicao.md`; falta
   você rodar no banco de testes
3. ~~Lista de requisições~~ — feita em 16/11/2026, em `/requisicoes`
4. ~~Tela da requisição, sem o encerrar~~ — feita em 17/11/2026, em `/requisicoes/:id`
5. Encerrar e o vínculo com Movimentações (os "extras" saíram na resposta da 3.3)
6. Teste, e aí produção
7. Depois, em branch dedicada: entrega em lote (3.7b), com a RPC de lote

Os passos 3 a 5 são commits separados na mesma branch, cada um com a tela funcionando.
