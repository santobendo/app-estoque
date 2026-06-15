## name: visual-clean-warm
description: Aplica a identidade visual minimalista, limpa e levemente aquecida em componentes, telas e fluxos do app.

# Identidade Visual Minimalista (Clean & Warm)

## O que faz

Injeta as diretrizes de design do projeto (tokens de cores, tipografia, estilos de botões, inputs, tabelas e modais) para garantir que toda a interface do aplicativo de estoque siga um padrão estético coeso, minimalista e de alta legibilidade.

## Quando usar

Sempre que for solicitar ao Gemini a criação, alteração ou expansão de telas (como Inventário, Visão Geral, Fornecedores, Movimentações), componentes de UI ou modais de fluxo dentro do Antigravity.

## Como usar

Siga rigorosamente os parâmetros de estilo abaixo ao gerar o código e os estilos da interface:

### 1. Paleta de Cores e Tokens Neutros

* **Fundo Global do App:** `#F6F5F2` (Cinza/bege muito claro e confortável)
* **Fundo de Cards, Tabelas e Sidebar:** `#FFFFFF`
* **Texto Principal (Títulos/Dark):** `#18161E` (Quase preto, alta legibilidade)
* **Texto Secundário / Hints:** `#999999` ou `#666666`
* **Bordas Principais:** `1px solid #E8E5DE` (Suave e levemente quente)
* **Bordas Internas / Divisores:** `1px solid #F0ECE5`

### 2. Paleta de Status (Badges e Categorias de Estoque)

Combine `dot` (marcador), `bg` (fundo) e `text` (texto) para sinalizar estados do inventário:

* **Sky (Padrão/Informativo):** Dot `#0EA5E9` | BG `#E0F2FE` | Texto `#0C4A6E`
* **Emerald (Sucesso/Disponível):** Dot `#10B981` | BG `#D1FAE5` | Texto `#064E3B`
* **Rose (Crítico/Em Falta):** Dot `#F43F5E` | BG `#FFE4E6` | Texto `#881337`
* **Amber (Atenção/Estoque Baixo):** Dot `#F59E0B` | BG `#FEF3C7` | Texto `#78350F`
* **Violet (Outros/Em Trânsito):** Dot `#8B5CF6` | BG `#EDE9FE` | Texto `#4C1D95`

### 3. Tipografia e Escala Neutra

* **Fonte Padrão:** `'Segoe UI', system-ui, sans-serif`
* **Títulos Principais (h1):** `fontSize: 18px`, `fontWeight: 700`, `color: #18161E`, `letterSpacing: "-0.3px"`
* **Cabeçalhos de Tabelas / Labels:** `fontSize: 11px`, `fontWeight: 700`, `color: #AAAAAA`, `textTransform: "uppercase"`, `letterSpacing: "0.08em"`
* **Textos de Itens / Dados:** `fontSize: 13px`, `fontWeight: 700` (para destaques/nomes) ou `fontWeight: 500` (dados gerais), `lineHeight: 1.2`
* **Subtextos / Legendas:** `fontSize: 12px`, `color: #999999`

### 4. Componentes Estruturais

* **Botão Primário:** Sem borda, `background: #18161E`, `color: #fff`, `borderRadius: 8px`, `fontSize: 13px`, `fontWeight: 600`, padding equilibrado (ex: `8px 14px`).
* **Botão Secundário / Neutro:** `border: "1.5px solid #E8E5DE"`, `background: #fff`, `color: #666666`, `borderRadius: 8px`, `fontSize: 13px`.
* **Botão Perigo / Alerta:** `border: "1.5px solid #FECACA"`, `background: #FFF5F5`, `color: #DC2626`, `borderRadius: 8px`.
* **Botão Tracejado (Ações rápidas de inserção):** `border: "1.5px dashed #DDD8CE"`, `borderRadius: 6px`, `color: #C5C0B4`, `background: transparent`.
* **Cards e Tabelas:** `background: #fff`, `borderRadius: 14px`, `border: "1px solid #E8E5DE"`, `overflow: "hidden"`.
* **Inputs:** `padding: "10px 12px"`, `border: "1.5px solid #E8E5DE"`, `borderRadius: 8px`, `fontSize: 14px`. No estado `:focus`, mudar a cor da borda para `#18161E`.
* **Modais:** Overlay escuro `rgba(24,22,30,.45)` com `backdropFilter: "blur(1px)"`. O corpo do modal deve ter `borderRadius: 16px`, `padding: 24px` e sombra pesada/elegante `boxShadow: "0 24px 64px rgba(0,0,0,.18)"`.
* **Sidebar (Painel Lateral):** Fundo fixo em `#FFFFFF`, com uma borda direita sutil de `1px solid #E8E5DE`. Itens de menu ativos usam cor `#18161E` com peso `700`, enquanto os inativos usam cor `#999999`.

### 5. Micro-interações (Animações)

* Todos os elementos interativos (botões, linhas da tabela clicáveis, links e chips) devem obrigatoriamente usar `transition: "all .15s"`.
* No efeito de `:hover` em chips de status ou linhas, aplique uma quebra leve de brilho (`filter: "brightness(.95)"`) ou opacidade sutil no background.

## Restrições

* Não utilize cores vibrantes de fundo fora dos tokens estritos mapeados para os badges de status.
* Não altere os tamanhos, pesos e espaçamentos de fonte determinados para não quebrar o minimalismo nítido da interface.
* Não adicione sombras genéricas (box-shadow) nos cards e elementos de grid; use apenas as bordas finas para delimitar o design linear. A única exceção que leva sombra projetada é o componente de modal.
* Mantenha o layout limpo e preserve o espaçamento, utilizando o fundo global do app (`#F6F5F2`) como respiro visual natural entre a barra lateral e os blocos de conteúdo.