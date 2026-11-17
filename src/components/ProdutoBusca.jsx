import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, CornerDownLeft } from 'lucide-react';
import { normalizar } from '../lib/texto';
import Kbd from './Kbd';

/* Morava dentro de Movimentacoes.jsx, que e o maior arquivo do projeto, e saiu
   quando a tela da requisicao precisou do mesmo campo para adicionar item.
   Sair agora, no primeiro segundo uso, e barato; sair depois de ja existirem
   duas copias e o que aconteceu com o Label e o SectionHeader, que divergiram
   calados. O componente nao sabe de requisicao nem de local: recebe o texto
   digitado, devolve o produto escolhido, e quem chama decide o que fazer.

   O `inputRef` e opcional e serve a quem quer dar foco de fora — e o que a
   tela de Movimentacoes faz ao abrir e depois de cada gravacao. */

/* ─── combobox de produto ───
   Busca o catálogo inteiro, não só o do local selecionado. Um produto que
   existe em outro estoque precisa aparecer para o aviso "não vinculada a
   este local" poder levar o usuário à tela do produto — filtrar aqui
   esconderia esse caminho e empurraria para o cadastro duplicado.

   O catálogo vem de uma consulta só, no lugar de um ilike por tecla: com
   ida ao servidor a cada letra a navegação por teclado fica intragável, e
   o ilike ainda ignora acento ("acucar" não achava "AÇÚCAR").

   O teto era 10, e cortava calado: quem buscava "fita" via dez itens em
   ordem alfabética e não tinha como saber que "fita transparente" ficou de
   fora — o jeito de descobrir era abrir o catálogo. O número subiu, mas o
   que conserta o bug é o rodapé dizer quantos sobraram: teto nenhum é
   grande o bastante se o corte é invisível. */
const MAX_RESULTADOS = 50;

export default function ProdutoBusca({ valor, onValorChange, onSelect, erro, inputRef }) {
  const [catalogo, setCatalogo]       = useState([]);
  const [carregando, setCarregando]   = useState(true);
  const [aberto, setAberto]           = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(0);

  const ref          = useRef(null);
  const itemAtivoRef = useRef(null);

  useEffect(() => {
    supabase
      .from('produtos')
      .select('id, nome, categorias(nome)')
      .order('nome')
      .then(({ data }) => {
        setCatalogo(data ?? []);
        setCarregando(false);
      });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const termo = normalizar(valor).trim();

  const encontrados = useMemo(() => {
    if (!termo) return [];
    return catalogo.filter(p => normalizar(p.nome).includes(termo));
  }, [catalogo, termo]);

  const resultados = useMemo(() => encontrados.slice(0, MAX_RESULTADOS), [encontrados]);
  const ocultos    = encontrados.length - resultados.length;

  const painelAberto = aberto && termo.length > 0;

  /* Mantém a linha destacada à vista quando a navegação passa do fim da área
     rolável. 'nearest' evita o salto quando ela já está visível. */
  useEffect(() => {
    if (painelAberto) itemAtivoRef.current?.scrollIntoView({ block: 'nearest' });
  }, [indiceAtivo, painelAberto]);

  const selecionar = (produto) => {
    onValorChange(produto.nome);
    setAberto(false);
    onSelect(produto);
  };

  const handleKeyDown = (e) => {
    /* Seta para baixo com o painel fechado reabre, em vez de não fazer nada:
       é como se volta à lista depois de fechar por engano. */
    if (!painelAberto) {
      if (e.key === 'ArrowDown' && termo.length > 0) {
        e.preventDefault();
        setAberto(true);
        setIndiceAtivo(0);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setAberto(false);
      return;
    }
    if (!resultados.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceAtivo(i => (i + 1) % resultados.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceAtivo(i => (i - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setIndiceAtivo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setIndiceAtivo(resultados.length - 1);
    } else if (e.key === 'Enter') {
      /* preventDefault senão o Enter envia o formulário da tela inteira. */
      e.preventDefault();
      const escolhido = resultados[indiceAtivo] ?? resultados[0];
      if (escolhido) selecionar(escolhido);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={valor}
          onChange={(e) => {
            onValorChange(e.target.value);
            setAberto(true);
            setIndiceAtivo(0);
            onSelect(null);
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar produto pelo nome…"
          autoComplete="off"
          role="combobox"
          aria-expanded={painelAberto}
          aria-controls="painel-produtos"
          aria-autocomplete="list"
          aria-activedescendant={painelAberto ? `produto-${indiceAtivo}` : undefined}
          className={`input-base w-full pl-9 ${erro ? 'border-rose-400' : ''}`}
        />
      </div>

      {painelAberto && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 card shadow-[0_16px_40px_rgba(0,0,0,0.12)] overflow-hidden">
          {carregando ? (
            <div className="px-4 py-3 text-[13px] text-app-text-secondary">
              Carregando produtos…
            </div>
          ) : resultados.length > 0 ? (
            <>
              <div
                id="painel-produtos"
                role="listbox"
                className="max-h-60 overflow-y-auto divide-y divide-app-border-inner"
              >
                {resultados.map((p, i) => {
                  const ativo = i === indiceAtivo;
                  return (
                    <button
                      key={p.id}
                      id={`produto-${i}`}
                      ref={ativo ? itemAtivoRef : null}
                      type="button"
                      role="option"
                      aria-selected={ativo}
                      onMouseEnter={() => setIndiceAtivo(i)}
                      onClick={() => selecionar(p)}
                      className={`w-full text-left px-4 py-2.5 border-l-2 transition-colors flex items-center gap-3 ${
                        ativo ? 'bg-app-bg border-app-text' : 'border-transparent'
                      }`}
                    >
                      <span className="text-[13px] font-semibold text-app-text truncate flex-1">
                        {p.nome}
                      </span>
                      {p.categorias?.nome && (
                        <span className="badge-sky text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0">
                          {p.categorias.nome}
                        </span>
                      )}
                      {ativo && <CornerDownLeft size={13} className="text-app-text-label shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="px-4 py-2 border-t border-app-border-inner bg-white flex items-center gap-3 text-[10px] text-app-text-label">
                <span><Kbd>↑</Kbd><Kbd>↓</Kbd> navegar</span>
                <span><Kbd>↵</Kbd> selecionar</span>
                <span><Kbd>esc</Kbd> fechar</span>
                {/* Nunca cortar calado: sem esta contagem o usuário não tem
                    como saber que existe resultado fora da lista. */}
                <span className={`ml-auto text-right tabular-nums ${ocultos > 0 ? 'text-amber-600 font-semibold' : ''}`}>
                  {ocultos > 0
                    ? `${resultados.length} de ${encontrados.length} · refine a busca`
                    : `${encontrados.length} ${encontrados.length === 1 ? 'resultado' : 'resultados'}`}
                </span>
              </div>
            </>
          ) : (
            <div className="px-4 py-3 text-[13px] text-app-text-secondary">
              Nenhum produto encontrado para “{valor.trim()}”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
