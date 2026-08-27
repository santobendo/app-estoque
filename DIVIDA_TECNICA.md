# Dívida técnica

Duas partes, ambas para depois que a refatoração de acesso por local terminar:
as seções **1 a 4** são o que o `npx eslint src` acusa; a seção **5** é um
problema de produto que decidimos adiar conscientemente.

**Estado em 27/08/2026:** 18 erros e 1 aviso, em 10 arquivos.
Nenhum quebra o build — `npx vite build` passa limpo.

```
npx eslint src
```

---

## 1. `react-hooks/set-state-in-effect` — 14 erros

O grosso da dívida, e um padrão único repetido no projeto todo:

```jsx
const fetch = useCallback(async () => {
  setLoading(true);
  const { data } = await supabase.from('...').select();
  setRows(data ?? []);
  setLoading(false);
}, []);

useEffect(() => { fetch(); }, [fetch]);
```

Onde aparece:

| Arquivo | Linhas |
|---|---|
| `src/pages/Movimentacoes.jsx` | 58, 166, 185, 206, 226 |
| `src/pages/Configuracoes.jsx` | 500, 741 |
| `src/pages/Historico.jsx` | 84, 87 |
| `src/pages/CadastroProduto.jsx` | 159 |
| `src/pages/Compras.jsx` | 25 |
| `src/pages/ProdutoDetalhe.jsx` | 67 |
| `src/components/TabelaCrud.jsx` | 66 |
| `src/contexts/LocalContext.jsx` | 57 |

**Por que não foi corrigido pontualmente:** é o idioma de carregamento de dados de
toda a base. Consertar um arquivo só cria duas convenções convivendo, o que é pior
que a dívida. Vale fazer numa passada única.

**Como resolver:** extrair um hook `useCarregamento(fn, deps)` que encapsule
`loading`/`dados`/`erro` e chamar dele em todas as telas. Some o erro e ainda tira
a repetição de `loading` e do tratamento de erro, que hoje é copiada tela a tela.

---

## 2. `react-refresh/only-export-components` — 3 erros

Arquivos que exportam componente **e** outra coisa, o que atrapalha o hot reload:

| Arquivo | Linha | O que exporta junto |
|---|---|---|
| `src/components/TabelaCrud.jsx` | 29 | `ConfirmDialog`, `Spinner`, `traduzErro` |
| `src/contexts/AuthContext.jsx` | 82 | `useAuth` |
| `src/contexts/LocalContext.jsx` | 84 | `useLocal` |

**Como resolver:** mover `traduzErro` para `src/lib/`, e os hooks `useAuth`/`useLocal`
para arquivos próprios (`useAuth.js`, `useLocal.js`). É mecânico, mas mexe em import
de quase toda tela — melhor num commit isolado.

---

## 3. `no-unused-vars` — 1 erro

`src/pages/Cadastros.jsx:37` — `Icon` desestruturado do `map` e nunca usado.
Correção de uma linha.

---

## 4. `react-hooks/exhaustive-deps` — 1 aviso — **NÃO CORRIGIR**

`src/pages/Movimentacoes.jsx:228`

```jsx
useEffect(() => {
  if (!motivosFiltrados.length) return;
  if (!motivosFiltrados.some(m => String(m.id) === motivoId)) {
    setMotivoId(String(motivosFiltrados[0].id));
  }
}, [tipo, motivos]);   // motivoId e motivosFiltrados omitidos DE PROPÓSITO
```

Este aviso é **intencional** e a lista de dependências está certa como está.

Incluir `motivoId` faria o efeito rodar a cada escolha do usuário; incluir
`motivosFiltrados` (array recriado a cada render) faria rodar a cada render. Nos dois
casos o efeito sobrescreveria a escolha manual do usuário.

**O bug que isso corrigiu:** saídas marcadas como "Consumo regular" eram gravadas com
motivo `ajuste`. O `<select>` tinha um valor que não correspondia a nenhum `<option>`
visível — a tela mostrava a primeira opção, mas o estado guardava o motivo antigo.
O efeito existe só para reconciliar isso quando o **tipo** muda, e não deve rodar em
nenhuma outra situação.

Se for silenciar, use `// eslint-disable-next-line react-hooks/exhaustive-deps` com
o motivo escrito ao lado — **não** adicione as dependências.

---

## 5. UX — a ação de vincular está escondida atrás da de criar

**Onde:** `src/pages/ProdutoDetalhe.jsx`, cartão "Apresentações".
**Adiado em 27/08/2026**, com o problema entendido e a correção desenhada.

Quando um produto ainda não é mantido no local do usuário, a ação útil é
*vincular uma apresentação que já existe* ao local dele. A tela oferece o
contrário:

| Ação | Frequência real | Peso na tela hoje |
|---|---|---|
| Vincular apresentação existente a um local | comum | `<select>` pequeno dentro de cada linha, rótulo "+ Vincular local…" |
| Criar apresentação nova | rara | botão primário no topo do cartão |

**O risco concreto:** o gerente abre ARROZ no Almoxarifado, quer estocar o
"Pacote 5kg" que já existe na Cozinha, não repara no select, clica no botão
grande e digita "Pacote 5kg" de novo. O `idx_apresentacoes_descricao_unica`
(migração 03) barra com `23505` — ou seja, ele é protegido do estrago por uma
mensagem de erro, não por um caminho. É a mesma duplicação que a
busca-antes-de-criar existe para evitar, travada no último metro.

**Correção desenhada:** quando o produto não tem nenhuma apresentação vinculada
ao local atual, abrir o cartão com um bloco de destaque —
*"ARROZ ainda não é mantido em Almoxarifado. Escolha quais embalagens estocar
aqui:"* — listando as apresentações existentes em caixas de seleção, com um
botão "Estocar em Almoxarifado". "Criar apresentação nova" vira link
secundário abaixo ("Nenhuma serve? Criar apresentação nova").

É o mesmo desenho da busca-antes-de-criar do `CadastroProduto`, aplicado onde o
usuário de fato cai. **Não precisa de SQL:** a
`fn_adiciona_apresentacoes_produto` (migração 04) já aceita apresentações
existentes por `id`, que é exatamente esse caso.
