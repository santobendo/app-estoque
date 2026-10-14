# Requisições — plano de implementação (fluxo alternativo)

Branch: `feature/requisicoes`. Ponto de partida: tag `v1.0.0`.

Escopo desta etapa: criar a requisição **a partir da tela de Movimentações**. As telas
dedicadas vêm depois — o modelo de dados aqui já é desenhado para elas, para não precisar
de migração de novo quando chegarem.

Este arquivo era um plano com perguntas; depois das suas respostas ele virou o registro
das decisões e do que ficou de fora. SQL em `migracoes/08_requisicoes.md`.

---

## 1. Modelo de dados

```
requisicoes
  id             serial PK        -- é o "número"
  digitado_por   uuid not null    -- responsável pela digitação do pedido
  entregue_por   uuid not null    -- responsável pela entrega
  criado_em      timestamptz      -- é a data da requisição
  atualizado_em  timestamptz      -- ordena o modal "requisições existentes"

requisicao_itens
  id                    serial PK
  requisicao_id         int not null  -> requisicoes
  apresentacao_id       int not null  -> apresentacoes   -- o que foi pedido
  local_id              int not null  -> locais          -- onde foi/será entregue
  quantidade_solicitada numeric not null
  criado_em             timestamptz

movimentacoes
  + requisicao_item_id  int null -> requisicao_itens     -- a entrega
```

### Sem coluna `data` — sua observação, e uma consequência

Você notou que `data` e `criado_em` guardariam a mesma coisa. Concordo, e por um motivo
melhor que o espaço (8 bytes por linha não pesam nesta base): são **duas verdades para o
mesmo fato**, e elas divergem no dia em que alguém editar uma e não a outra.

A consequência fica para a tela dedicada. Você especificou que lá a data é escolhível. Se
só existe `criado_em`, escolher a data reescreve o carimbo de auditoria — perde-se quando
a linha realmente entrou no banco. Quando chegarmos lá, a saída é uma coluna `data` nova
com `update requisicoes set data = criado_em`: um `alter table` e um `update`, barato.
Não vale criar agora uma coluna que nenhuma tela preenche.

### Por que `quantidade_entregue` não é coluna

Ela **existe**, mas como soma das movimentações vinculadas ao item:

```sql
quantidade_entregue = sum(movimentacoes.quantidade)
                      where requisicao_item_id = item.id
```

`estoques.quantidade_atual` é cache, e foi dali que veio o bug do "saldo nunca
atualizava". Pior: hoje o admin **pode excluir movimentação** — se `quantidade_entregue`
fosse coluna, cada exclusão precisaria de outro trigger para corrigi-la, e um esquecimento
deixaria o número mentindo para sempre. Derivada, ela se corrige sozinha. Mora na view
`vw_requisicao_itens`.

### Por que o item aponta para `apresentacao_id` + `local_id`

Porque a tela dedicada vai criar o item **antes** de existir qualquer entrega: pedir 10
hoje, entregar 8 amanhã e 2 depois. O item tem que poder existir com zero movimentações e
aceitar mais de uma. No fluxo alternativo os dois nascem juntos, na mesma transação.

### Numeração

O `id` serial é o número. Se um dia quiserem número formatado (`REQ-2026-0001`), isso
entra como coluna nova, não como troca de chave primária.

---

## 2. Quando a requisição é criada — **opção A, criação tardia**

Decidido: a requisição nasce na **primeira saída gravada**, não ao abrir a tela.

Criar na entrada da tela inseriria uma linha a cada visita — abrir Movimentações para
conferir um saldo e sair deixaria uma requisição vazia, e furos na numeração. Com a
criação tardia a seção mostra "o número sai na primeira saída" e, dali em diante, o número
fica aparente como você queria.

Quem garante que isso é atômico é `fn_registra_saida_requisicao`: cabeçalho, item e
movimentação numa transação só.

---

## 3. Complicações e o que foi decidido

### 3.1 Requisição cruza locais, mas o RLS é por local — **liberado só para admin, na tela**

Desenho no banco, já aplicado:

- **Cabeçalho** legível por qualquer usuário ativo. É o que torna o fluxo cruzado
  possível: o gerente da Cozinha precisa achar, no modal, a requisição que o gerente do
  Almoxarifado começou. Expõe número, data e os dois nomes — sem produto e sem quantidade.
- **Itens** filtrados por local, pela cadeia que já existe.

Você pediu para começar só com administradores, e perguntou o custo de abrir para gerentes
depois. **Resposta: quase zero, e é por isso que o recorte ficou na tela e não em policy.**

Em `Movimentacoes.jsx`:

```js
const mostraRequisicao = isAdmin && modo === 'movimento' && tipo === 'saida';
```

Abrir para gerentes é apagar `isAdmin &&` dessa linha. Nenhuma migração, nenhum SQL nos
três bancos.

O raciocínio: RLS existe para proteger dado de local alheio, e as policies fazem isso.
"Só admin por enquanto" não é proteção de dado, é decisão de implantação — e decisão de
implantação que vira policy cobra uma migração 09 nos três bancos no dia em que você mudar
de ideia. O efeito colateral honesto é que um gerente que chamasse a API diretamente
conseguiria criar requisição antes da liberação; ele já pode criar movimentação no local
dele, então nada de novo fica ao alcance dele — só o número da requisição.

Se preferir travar no banco também, é trocar as duas policies de insert por
`fn_is_admin()`. A nota no fim da migração 08 explica como voltar.

### 3.2 A requisição ativa vive só na memória da tela — **resolvido com sessionStorage**

Um F5 no meio de uma requisição de 15 itens começaria outra e partiria a original em duas.
O id da requisição ativa e a opção escolhida ficam em `sessionStorage`: sobrevivem ao F5 e
morrem ao fechar a aba. Se a requisição não voltar (excluída, ou acesso perdido), a sessão
é limpa em silêncio.

### 3.3 Mesmo produto duas vezes — **reaproveita o item e soma a entrega**

Você perguntou o custo de detectar e somar em vez de duplicar o item. **É mais barato do
que eu tinha sugerido, e deixa o dado melhor para o uso futuro que você mencionou.**

O que custou:

1. Um `select` a mais na RPC, procurando item com mesmo `(requisicao_id, apresentacao_id,
   local_id)`. Se achar, reusa o id; se não, cria.
2. Um índice **único** nessas três colunas — que por si só é um ganho: duas abas
   disputando não conseguem criar itens duplicados.
3. Zero em `quantidade_entregue`: ela já era soma de N movimentações por item. Duas
   retiradas do mesmo produto somam sozinhas.

O que **não** custou, e seria o custo real se eu tivesse feito diferente: decidir o que
acontece com a `quantidade_solicitada` quando o usuário digita outro valor na segunda
retirada — manter a primeira? sobrescrever? somar? Em vez de escolher entre três regras
defensáveis, a tela não pergunta de novo: quando o produto já está na requisição, o campo
aparece **travado** com o valor já definido e a nota "a entrega soma à anterior". Não há o
que reconciliar. A RPC descarta um valor enviado nesse caso, então a API também não
contorna.

### 3.4 Excluir uma movimentação que pertence a uma requisição

O item sobrevive com solicitada preenchida e entregue zero — leitura honesta de "foi
pedido e não foi entregue", como você confirmou. Isso sai de graça: o vínculo mora na
movimentação. O `on delete set null` da FK serve ao caminho contrário, proteger o
histórico de estoque se um dia um item for apagado.

### 3.5 Quantidade entregue divergindo da solicitada

Esperado (pediu 10, tinha 8). Não é bloqueado. A lista de itens mostra `entregue /
solicitada` e, quando a entrega passa do pedido, pinta de âmbar com "acima do pedido" —
avisa sem impedir.

### 3.6 Movimentações já era o arquivo mais complexo — **componente próprio**

A seção saiu como `src/components/SecaoRequisicao.jsx` (cartões, modal e lista de itens),
recebendo e devolvendo estado por props. `Label` e `SectionHeader`, que as duas telas usam,
foram para `src/components/Secao.jsx` — mesmo motivo do `Kbd`: duas telas usam e nenhuma é
dona. `Movimentacoes.jsx` ganhou o estado e a chamada, não o desenho.

Contagem de lint do arquivo antes e depois: **4 erros + 1 aviso nas duas**. Não entrou
dívida nova. Os três efeitos que eu ia escrever com `setState` síncrono viraram handlers
de clique e valores derivados.

---

## 4. Como ficou a tela

| Hoje | Saída (admin) | Entrada / ajuste |
|---|---|---|
| 1. Tipo de Movimentação | 1. Tipo de Movimentação | 1. Tipo de Movimentação |
| 2. Produto | **2. Requisição** | 2. Produto |
| 3. Detalhes | 3. Produto | 3. Detalhes |
| | 4. Detalhes | |

Três cartões no padrão da seção 1: **Nova requisição**, **Requisição existente**, **Sem
requisição**. O padrão é **Sem requisição**, para a tela abrir se comportando exatamente
como antes. Clicar em "Requisição existente" já abre o modal — o clique extra que você
mencionou vira o clique que escolhe a requisição.

Com requisição ativa a seção mostra número (grande), data, os dois responsáveis e a lista
de itens. Trocar o tipo para entrada ou ajuste encerra a requisição, como você
especificou. Trocar de opção também descarta a ativa — se for sem querer, a opção 2 traz
de volta em um clique, já que ela é a primeira da lista.

**Itens já lançados**, do jeito que você pediu: recolhida, a seção mostra **só o último
lançamento** e "clique para ver os outros N". Expandida, mostra todos. Numa requisição de
15 itens a seção não cresce a cada baixa.

**Responsáveis:** selects para admin **antes** da requisição existir; depois de criada,
texto fixo com os nomes. Trocar depois seria UPDATE no cabeçalho e mudaria o registro de
quem já entregou.

**Seção de detalhes** ganha **Quantidade solicitada** ao lado da quantidade, que passa a
se chamar "Quantidade entregue" quando há requisição.

### O modal de requisição existente

Lista número, data, os dois responsáveis e a contagem de itens, ordenada por
`atualizado_em` desc, limitada a 50. Busca por número **ou** por nome de quem digitou /
entregou (sai de graça e resolve "aquela que o Pedro abriu"), sem acento, pelo `normalizar`
de sempre. Teclado no padrão do combobox: setas andam, Enter escolhe, Esc fecha — com
`preventDefault` no Enter, senão a tecla enviaria o formulário em volta.

---

## 5. Banco — migração 08

Em `migracoes/08_requisicoes.md`, em quatro partes e com cinco testes. Já sincronizada no
`estoque_schema_normalizado.sql`, no mesmo commit, como manda a convenção.

1. Tabelas, índices e a coluna em `movimentacoes`
2. GRANT nas tabelas **e nas sequences** (a lição do `usuarios_locais` e a do
   `produtos_id_seq`: sem `usage` na sequence a leitura funciona e só o primeiro insert
   falha), RLS e 8 policies
3. `fn_toca_requisicao` (trigger de `atualizado_em`, `security definer` porque usuário
   comum não tem UPDATE no cabeçalho) e `fn_registra_saida_requisicao`
4. `vw_requisicoes` e `vw_requisicao_itens`, as duas com `security_invoker = on`

Sobre a sua dúvida do `atualizado_em`: o Supabase não atualiza isso sozinho. `default
now()` só vale no insert; manter a coluna em dia é sempre trigger (é o mesmo desenho que
`perfis.atualizado_em` já usa).

Os testes rodam em `begin/rollback`, então não gravam nada. O 3 é o que prova a decisão de
somar a entrega, e o 4 a requisição cruzando locais.

---

## 6. Estado da execução

| | |
|---|---|
| 1. Migração 08 | escrita — **falta você rodar no banco de testes** |
| 2. `SecaoRequisicao.jsx` com as três opções | feito |
| 3. Modal de requisição existente | feito |
| 4. RPC e gravação | feito |
| 5. Lista de itens da requisição ativa | feito |
| 6. Responsáveis para admin | feito |
| 7. Teste do fluxo cruzando locais | teste 4 da migração; falta o teste pela tela |

---

## 7. Fora do escopo, registrado para não se perder

- **Tela de parâmetros em Configurações** — sua ideia para o admin escolher defaults como
  a opção de requisição que vem selecionada, e depois o modo escuro. Boa, e o default de
  requisição é o primeiro candidato: hoje ele é uma constante em `Movimentacoes.jsx`.
- **Requisição na tela de Histórico** — mostrar "Req #12" na linha da movimentação sairia
  barato (a coluna já existe), mas não estava no pedido e eu não quis ampliar escopo.
- **Telas dedicadas de requisição** — criar o pedido antes da entrega, entrega parcial,
  data escolhida à mão (ver a coluna `data` na seção 1), edição da solicitada.
- **`Label`/`SectionHeader` duplicados** em `CadastroProduto.jsx` e `ProdutoDetalhe.jsx` —
  agora que existe `components/Secao.jsx`, cabe unificar na faxina de lint.
