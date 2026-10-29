# Dívida técnica — lint

**Estado em 15/10/2026: zero.** `npx eslint src` não acusa erro nem aviso, e
`npx vite build` passa limpo.

```
npx eslint src
```

O registro do que havia fica abaixo, porque o **como** foi resolvido virou
convenção do projeto — e porque dois dos itens não eram o que pareciam.

---

## O que havia

| Regra | Quantidade | Como foi resolvido |
|---|---|---|
| `react-hooks/set-state-in-effect` | 13 erros | hook `useCarregamento`, e derivar no lugar de efeito |
| `react-refresh/only-export-components` | 3 erros | `lib/erros.js`, `contexts/auth.js`, `contexts/local.js` |
| `no-unused-vars` | 1 erro | era falso positivo — `argsIgnorePattern` no config |
| `react-hooks/exhaustive-deps` | 1 aviso | derivado; o efeito deixou de existir |

---

## 1. O hook de carregamento

O idioma copiado em dez telas era este:

```jsx
const fetch = useCallback(async () => {
  setLoading(true);
  const { data } = await supabase.from('...').select();
  setRows(data ?? []);
  setLoading(false);
}, []);

useEffect(() => { fetch(); }, [fetch]);
```

O `setLoading(true)` roda de forma síncrona durante o efeito, o que força um
segundo render antes de pintar. Agora:

```jsx
const { dados, carregando, erro, recarregar } = useCarregamento(
  async () => {
    const { data, error } = await supabase.from('x').select();
    if (error) throw error;
    return data ?? [];
  },
  [localAtual?.id],   // muda, recarrega
  [],                 // valor antes da primeira resposta
);
```

O `src/lib/useCarregamento.js` explica as duas decisões que não são óbvias: o
`useEffectEvent` guardando a função de carga, e o `carregando` ser **derivado**
em vez de estado — é isso que faz o spinner aparecer no mesmo render em que a
dependência muda, sem nenhum `setState` dentro do efeito.

**Uma perda a registrar:** a lista de dependências de um hook próprio não é
checada pelo `exhaustive-deps`. Quem mexer numa carga precisa conferir a lista
na mão; o lint não avisa mais.

**Duas exceções conscientes**, documentadas no código:

- `Configuracoes.jsx`, aba Acessos — grava nos próprios estados e mantém o
  `loading` dela, porque a matriz de acessos é alterada de forma otimista a
  cada clique e o refetch não deve piscar "Carregando" sobre uma grade cheia.
- `Movimentacoes.jsx` — a restauração da requisição ativa continua um efeito
  de verdade: ela sincroniza com o `sessionStorage`, que é sistema externo.
  Efeito para isso é o uso correto, não dívida.

## 2. Derivar no lugar de efeito

Onde o efeito só reconciliava um valor com uma lista, o valor passou a ser
derivado. O padrão, repetido em quatro lugares:

```jsx
const [motivoEscolhido, setMotivoEscolhido] = useState('');

const motivoId = motivosFiltrados.some(m => String(m.id) === motivoEscolhido)
  ? motivoEscolhido
  : (motivosFiltrados[0] ? String(motivosFiltrados[0].id) : '');
```

O estado guarda a **escolha do usuário**; o que a tela usa é o valor válido
para a lista de agora. Serve para motivo, apresentação, estoque e para a página
do Histórico.

**O aviso que estava marcado "NÃO CORRIGIR" saiu daqui.** A instrução era não
adicionar dependências ao efeito do `motivoId`, e ela continua certa: adicionar
faria o efeito sobrescrever a escolha manual. O que mudou é que o efeito não
existe mais. O bug que ele consertava — saída marcada como "Consumo regular"
gravada como ajuste, porque o `<select>` exibia uma opção e o estado guardava
outra — não tem como voltar, porque agora o valor exibido e o gravado são o
mesmo. A explicação longa está no comentário em `Movimentacoes.jsx`.

## 3. O falso positivo

`Cadastros.jsx` — `({ icon: Icon })` era acusado de nunca usado, com
`<Icon size={20} />` três linhas abaixo. Sem o `eslint-plugin-react`, uso só em
JSX não conta, e o `varsIgnorePattern` que já existia não alcança parâmetro
desestruturado, que é argumento e não variável. Resolvido com
`argsIgnorePattern: '^[A-Z_]'` no `eslint.config.js`, em vez de uma dependência
nova só pelo `jsx-uses-vars`.

## 4. Componentes duplicados

`Label` e `SectionHeader` viviam em quatro arquivos e já tinham divergido: a
cópia do CadastroProduto não aceitava `subtitle`, a do ProdutoDetalhe não
aceitava `required`. Agora só em `components/Secao.jsx`. O custo de componente
duplicado não é a repetição — é a divergência calada.
