# Registro de Bugs — revisão de 07/07/2026

Revisão completa do código atrás de bugs, com foco nas partes ainda não
refatoradas. Duas seções: o que **já foi corrigido** nesta revisão e o que
ficou **documentado para depois**.

---

## Corrigidos nesta revisão

### 1. CRÍTICO — Saldo de estoque nunca atualizava ao registrar movimentação
`fn_atualiza_estoque` (trigger de `movimentacoes`) rodava com as permissões
do usuário logado, e a tabela `estoques` não tem policy de UPDATE (de
propósito). Com RLS ativo, o UPDATE do trigger não encontrava linhas e
falhava **em silêncio**: a movimentação era gravada, mas o saldo ficava
congelado. Corrigido tornando a função `security definer`.

### 2. CRÍTICO — Consumo não consolidava apresentações (o "problema da aveia")
`vw_consumo_30_dias` agrupava por `quantidade_unitaria` e `quantidade_atual`,
gerando uma linha por apresentação. Consumir 2 pacotes de 500g + 1 de 1kg
aparecia como duas linhas separadas na Sugestão de Compra, em vez de 2kg
consolidados. A view foi reescrita (CTEs `consumo` + `saldo`) para agrupar
por produto × local × unidade. Bônus: produtos sem consumo nos últimos 30
dias agora também aparecem na sugestão (com consumo 0).

### 3. Produtos duplicados eram permitidos
`produtos.nome` não tinha constraint UNIQUE — dava para cadastrar "AVEIA"
duas vezes, quebrando a consolidação por produto. O código do frontend até
tratava o erro de duplicidade, mas ele nunca disparava. Adicionado `unique`.

### 4. Usuário desativado logava e navegava sem nenhum aviso
O RLS bloqueia escritas de usuários com `ativo = false`, mas a interface não
comunicava nada — a pessoa via as telas e nada funcionava. Agora o
`MainLayout` mostra a tela "Conta desativada" com botão de sair.

### 5. Mensagens de erro do login cruas e em inglês
"Invalid login credentials" etc. Traduzidas as mais comuns (credenciais,
e-mail não confirmado, conta banida, rate limit, falha de rede).

### 6. Erro de movimentação em `alert()` cru
Substituído por banner com mensagem traduzida. Inclui o caso de corrida:
duas pessoas dando baixa ao mesmo tempo — o banco bloqueia saldo negativo
(constraint) e agora a mensagem é legível.

### 7. Busca do Histórico quebrava com vírgula ou parênteses
Caracteres especiais na busca quebravam a sintaxe do `.or()` do PostgREST e
a busca falhava em silêncio (a tabela simplesmente não filtrava). Agora são
removidos antes da consulta.

### 8. Erros silenciosos na aba Usuários (Configurações)
Alterar admin/ativo/papel ignorava o retorno de erro — se o banco recusasse,
a tela só "não mudava". Agora exibe banner de erro.

### 9. Seletor de local não atualizava após CRUD de locais
Criar/renomear/desativar um local em Cadastros → Locais não refletia na
barra superior até dar F5. `TabelaCrud` ganhou `onDataChange` e a tela de
locais chama `refreshLocais()`.

### 10. Código morto removido
`src/components/Layout.jsx` (layout antigo dark, não importado por ninguém,
usava classe CSS inexistente) e `src/App.css` (não importado).

### 11. Cadastro de produto agora é transacional (era o item A)
Criada a função RPC `fn_cria_produto_completo` (security invoker — o RLS do
usuário continua valendo): produto + apresentações + estoques + saldo
inicial numa transação única. Se qualquer etapa falhar, nada é gravado.
`CadastroProduto.jsx` passou a chamar a RPC e trocou os `alert()` por banner.

### 12. Saldo inicial agora gera movimentação (era o item C)
Dentro da RPC, a quantidade inicial entra como movimentação de `entrada`
com motivo `ajuste` — o histórico registra a origem do saldo e o trigger
atualiza o estoque.

### 13. Estoque mínimo por item (era o item B)
Nova coluna `estoques.estoque_minimo` (por apresentação × local, em
embalagens). Usos:
- **Catálogo**: status "Baixo" quando `quantidade <= mínimo` (antes era um
  5 fixo para qualquer produto);
- **Sugestão de Compra**: fórmula virou
  `consumo 30d + mínimo − estoque atual` (o mínimo funciona como estoque de
  segurança) e a tela ganhou a coluna "Mínimo";
- **Detalhe do Produto**: admins editam o mínimo clicando em "mín X" no
  chip de cada local.
Também foi criada a policy "admin pode atualizar estoques" (necessária para
editar o mínimo; `quantidade_atual` continua mudando só via trigger de
movimentações).

---

## SQL pendente no banco (se NÃO for recriar do zero)

Se recriar o banco com o `estoque_schema_normalizado.sql` atualizado, ignore
esta seção. Caso contrário, rode no SQL Editor, além dos trechos já listados
nas conversas anteriores (fn_protege_perfil, policies de delete, view de
auditoria):

```sql
-- Bug 1: saldo não atualizava
-- copie do schema a versão atual de fn_atualiza_estoque (security definer)

-- Bug 3: produtos únicos (falha se já existirem duplicados — resolva antes)
alter table produtos add constraint produtos_nome_key unique (nome);

-- Bug 13: estoque mínimo
alter table estoques
  add column estoque_minimo numeric(12,4) not null default 0,
  add constraint estoques_minimo_nao_negativo check (estoque_minimo >= 0);

create policy "admin pode atualizar estoques"
  on estoques for update to authenticated
  using (fn_is_admin());

-- Bugs 2 e 13: views (a ordem importa — consumo primeiro)
-- copie do schema os blocos "create or replace view vw_consumo_30_dias"
-- e "create or replace view vw_sugestao_compra"

-- Bugs 11 e 12: RPC transacional
-- copie do schema o bloco "18.1 FUNÇÃO RPC fn_cria_produto_completo"
```

---

## Documentados (não corrigidos ainda)

*(Os antigos itens A, B e C foram corrigidos — ver itens 11–13 acima.)*

### D. Usuário desativado ainda LÊ dados pela API
As policies de SELECT exigem só `authenticated`, sem checar `fn_is_ativo()`.
A tela "Conta desativada" resolve o uso normal, mas alguém com o token
poderia consultar a API diretamente. **Sugestão:** banir via
`supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })` numa
Edge Function quando desativar (a nota no fim do schema já descreve), ou
trocar as policies de SELECT para `using (fn_is_ativo())`.

### E. Variáveis de ambiente sem validação
`supabaseClient.js` não valida `VITE_SUPABASE_URL` / `VITE_SUPABASE_KEY` —
se faltarem, o erro é críptico. **Sugestão:** `throw` com mensagem clara.

### F. Unidades diferentes no mesmo produto não se convertem
Se uma apresentação for cadastrada em `g` e outra em `kg`, a view gera
linhas separadas (correto para não somar errado, mas pode confundir).
**Convenção adotada:** cadastrar todas as apresentações de um produto na
mesma unidade base (ex: sempre `kg`, usando 0.5 para 500g). **Sugestão
futura:** fator de conversão na tabela `unidades` ou validação na tela.

### G. Perfil não recarrega em tempo real
`AuthContext` busca o perfil só no login — se um admin alterar
`is_admin`/`ativo` de alguém logado, a mudança só vale após relogin/F5.
**Sugestão:** re-buscar o perfil ao focar a janela ou usar Realtime.
