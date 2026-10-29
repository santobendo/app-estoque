import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  FilePlus, FileSearch, FileX, Search, X, ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';
import { normalizar } from '../lib/texto';
import Kbd from './Kbd';
import { Spinner } from './TabelaCrud';
import { Label, SectionHeader } from './Secao';

/* ─── Seção "Requisição" da tela de Movimentações ───
   Mora aqui, e não dentro de Movimentacoes.jsx, porque aquela tela já é a mais
   complexa do projeto: combobox com teclado, modo ajuste, bloqueio de
   somente-leitura e toasts. Empilhar mais cem linhas ali pioraria o pior
   arquivo — a tela ganha uma linha e o estado continua sendo dela.

   A requisição é criada tarde, na primeira saída gravada (fn_registra_saida_
   requisicao faz isso em transação única). Por isso esta seção exibe "o número
   sai na primeira saída" em vez de um número: criar ao abrir a tela deixaria
   uma requisição vazia cada vez que alguém entra aqui só para conferir um
   saldo, e furos na numeração. */

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* O modal lista as mais recentes, que é o caso de uso real: ninguém entrega
   contra uma requisição de semanas atrás. O número vale ser constante porque
   o estado vazio da busca o cita. */
const LIMITE_LISTA = 50;

const num = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
};

/* ─── Cartão de opção, no mesmo padrão da seção 1 (Tipo de Movimentação) ─── */
function CartaoOpcao({ ativo, onClick, icone, titulo, descricao, cor }) {
  const Icone = icone;
  const paleta = {
    indigo:  ativo ? 'border-indigo-400 bg-indigo-50 text-indigo-700'   : 'border-app-border hover:border-indigo-200 text-app-text-secondary',
    sky:     ativo ? 'border-sky-400 bg-sky-50 text-sky-700'            : 'border-app-border hover:border-sky-200 text-app-text-secondary',
    neutro:  ativo ? 'border-app-text bg-app-bg text-app-text'          : 'border-app-border hover:border-app-text-label text-app-text-secondary',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`flex items-center gap-3 p-4 rounded-xl border-[1.5px] transition-all cursor-pointer ${paleta[cor]}`}
    >
      <Icone size={22} className="shrink-0" />
      <div className="text-left">
        <p className="text-[13px] font-bold">{titulo}</p>
        <p className="text-[11px] opacity-75">{descricao}</p>
      </div>
    </button>
  );
}

/* ─── Modal de requisição existente ───
   Teclado no mesmo padrão do combobox de produto: setas andam, Enter escolhe,
   Esc fecha. O preventDefault no Enter é obrigatório — o modal é renderizado
   dentro do <form> da tela, e sem ele a tecla enviaria a movimentação. */
function ModalRequisicoes({ onSelecionar, onFechar }) {
  const [lista, setLista]             = useState([]);
  const [carregando, setCarregando]   = useState(true);
  const [busca, setBusca]             = useState('');
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const inputRef = useRef(null);
  const listaRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    let vivo = true;
    supabase
      .from('vw_requisicoes')
      .select('id, criado_em, atualizado_em, digitado_por, entregue_por, digitado_por_nome, entregue_por_nome, itens')
      .order('atualizado_em', { ascending: false })
      .limit(LIMITE_LISTA)
      .then(({ data }) => {
        if (!vivo) return;
        setLista(data ?? []);
        setCarregando(false);
      });
    return () => { vivo = false; };
  }, []);

  /* Busca por número é o caso principal, mas filtrar pelos nomes de quem
     digitou ou entregou sai de graça e resolve "aquela que o Pedro abriu".

     O filtro roda sobre as LIMITE_LISTA mais recentes, não sobre o banco:
     requisição mais antiga que isso não é encontrável aqui. O estado vazio
     diz isso em voz alta — a alternativa de buscar no servidor por número
     fica para quando o volume justificar. */
  const filtradas = useMemo(() => {
    const termo = normalizar(busca).trim();
    if (!termo) return lista;
    const digitos = termo.replace(/\D/g, '');
    return lista.filter(r =>
      (digitos !== '' && String(r.id).includes(digitos))
      || [r.digitado_por_nome, r.entregue_por_nome].some(n => normalizar(n).includes(termo)),
    );
  }, [lista, busca]);

  /* O índice volta ao topo no onChange da busca, não num efeito: o resultado
     muda por causa da digitação, e é lá que a decisão pertence. */
  const digitar = (texto) => { setBusca(texto); setIndiceAtivo(0); };

  useEffect(() => {
    listaRef.current?.querySelector('[data-ativo="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [indiceAtivo, filtradas.length]);

  const teclado = (e) => {
    if (e.key === 'Escape')    { e.preventDefault(); onFechar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceAtivo(i => Math.min(i + 1, filtradas.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIndiceAtivo(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const escolhida = filtradas[indiceAtivo];
      if (escolhida) onSelecionar(escolhida);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <div
        className="modal-content max-w-xl p-0 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Escolher requisição existente"
      >
        <div className="px-6 py-4 border-b border-app-border-inner flex items-center justify-between gap-3">
          <p className="text-[13px] font-bold text-app-text uppercase tracking-wide">
            Requisições abertas
          </p>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="text-app-text-label hover:text-app-text cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label" />
            <input
              ref={inputRef}
              value={busca}
              onChange={e => digitar(e.target.value)}
              onKeyDown={teclado}
              placeholder="Número da requisição ou nome do responsável"
              className="input-base w-full pl-9"
              aria-label="Buscar requisição"
            />
          </div>
          <p className="mt-2 text-[11px] text-app-text-label">
            <Kbd>↑</Kbd><Kbd>↓</Kbd> navega · <Kbd>Enter</Kbd> escolhe · <Kbd>Esc</Kbd> fecha
          </p>
        </div>

        <div ref={listaRef} className="mt-3 max-h-[340px] overflow-y-auto px-3 pb-3" role="listbox">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-app-text-secondary">
              <Spinner /> Carregando requisições...
            </div>
          ) : filtradas.length === 0 ? (
            <p className="py-10 text-center text-[12px] text-app-text-secondary">
              {lista.length === 0
                ? 'Nenhuma requisição foi criada ainda. Use "Nova requisição".'
                : lista.length >= LIMITE_LISTA
                  ? `Nada encontrado entre as ${LIMITE_LISTA} requisições mais recentes, que são as únicas listadas aqui. Se a que você procura for mais antiga, ela não aparece nesta busca.`
                  : 'Nenhuma requisição encontrada para essa busca.'}
            </p>
          ) : (
            filtradas.map((r, i) => (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={i === indiceAtivo}
                data-ativo={i === indiceAtivo}
                onMouseEnter={() => setIndiceAtivo(i)}
                onClick={() => onSelecionar(r)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  i === indiceAtivo ? 'bg-app-bg' : 'hover:bg-app-bg'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-bold text-app-text">#{r.id}</span>
                  <span className="text-[11px] text-app-text-label">
                    {r.itens === 1 ? '1 item' : `${r.itens} itens`}
                  </span>
                </div>
                <p className="text-[11px] text-app-text-secondary mt-0.5">
                  {formatarData(r.criado_em)} · digitou {r.digitado_por_nome ?? '—'} · entregou {r.entregue_por_nome ?? '—'}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Lista compacta dos itens já lançados ───
   Mostra só o último lançamento; clicar abre o resto. Numa requisição de 15
   itens a seção não pode crescer a cada baixa, ou o formulário vai embora da
   tela. A contagem respeita o RLS: um item de local que o usuário não vê não
   entra aqui nem no total. */
function ItensLancados({ itens }) {
  const [aberto, setAberto] = useState(false);
  if (itens.length === 0) return null;

  const visiveis = aberto ? itens : itens.slice(0, 1);

  return (
    <div className="border-t border-app-border-inner pt-3">
      <button
        type="button"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 text-left cursor-pointer group"
      >
        <span className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
          {itens.length === 1 ? '1 item lançado' : `${itens.length} itens lançados`}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-app-text-secondary group-hover:text-app-text">
          {aberto ? 'recolher' : 'ver todos'}
          {aberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      <ul className="mt-2 flex flex-col gap-1">
        {visiveis.map(i => {
          const excedeu = Number(i.quantidade_entregue) > Number(i.quantidade_solicitada);
          return (
            <li key={i.id} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-app-text truncate">
                <span className="font-semibold">{i.produto}</span>
                <span className="text-app-text-secondary"> · {i.apresentacao} · {i.local}</span>
              </span>
              <span className={`shrink-0 font-semibold tabular-nums ${excedeu ? 'text-amber-600' : 'text-app-text-secondary'}`}>
                {num(i.quantidade_entregue)} / {num(i.quantidade_solicitada)}
                {excedeu && <span className="ml-1 font-normal">acima do pedido</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {!aberto && itens.length > 1 && (
        <p className="mt-1 text-[11px] text-app-text-label">
          último lançamento · clique para ver os outros {itens.length - 1}
        </p>
      )}
    </div>
  );
}

export default function SecaoRequisicao({
  numeroSecao,
  opcao,
  onOpcaoChange,
  requisicao,
  onRequisicaoChange,
  itens,
  isAdmin,
  usuarios,
  nomeUsuario,
  digitadoPor,
  onDigitadoPorChange,
  entreguePor,
  onEntreguePorChange,
  erro,
}) {
  const [modalAberto, setModalAberto] = useState(false);

  const escolher = (opcaoNova) => {
    onOpcaoChange(opcaoNova);
    if (opcaoNova === 'existente') setModalAberto(true);
  };

  const comRequisicao = opcao !== 'sem';

  return (
    <div className="card">
      <SectionHeader
        number={numeroSecao}
        title="Requisição"
        subtitle="agrupa as saídas de um mesmo pedido"
      />

      <div className="p-6 flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <CartaoOpcao
            ativo={opcao === 'nova'}
            onClick={() => escolher('nova')}
            icone={FilePlus}
            titulo="Nova requisição"
            descricao="Abre um número novo"
            cor="indigo"
          />
          <CartaoOpcao
            ativo={opcao === 'existente'}
            onClick={() => escolher('existente')}
            icone={FileSearch}
            titulo="Requisição existente"
            descricao="Continuar um pedido aberto"
            cor="sky"
          />
          <CartaoOpcao
            ativo={opcao === 'sem'}
            onClick={() => escolher('sem')}
            icone={FileX}
            titulo="Sem requisição"
            descricao="Baixa solta, sem pedido"
            cor="neutro"
          />
        </div>

        {erro && (
          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[12px]">
            <AlertCircle size={14} className="shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        {comRequisicao && (
          <div className="flex flex-col gap-4 rounded-xl border-[1.5px] border-app-border-inner bg-app-bg/40 p-4">
            {/* Número + ação */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
                  Número
                </p>
                {requisicao ? (
                  <p className="text-2xl font-bold text-app-text leading-tight">#{requisicao.id}</p>
                ) : (
                  <p className="text-[13px] text-app-text-secondary mt-1 max-w-sm">
                    {opcao === 'nova'
                      ? 'Sai ao registrar a primeira saída — o número é gerado junto com ela.'
                      : 'Nenhuma requisição escolhida ainda.'}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setModalAberto(true)}
                className="btn btn-secondary px-3 py-2 text-[12px] shrink-0"
              >
                {requisicao ? 'Trocar' : 'Escolher...'}
              </button>
            </div>

            {/* Data e responsáveis */}
            <div className="grid grid-cols-3 gap-4 border-t border-app-border-inner pt-4">
              <div className="flex flex-col gap-1.5">
                <Label>Data</Label>
                <p className="text-[13px] text-app-text pt-[2px]">
                  {requisicao ? formatarData(requisicao.criado_em) : 'na primeira saída'}
                </p>
              </div>

              {/* Os responsáveis são escolhidos antes da requisição existir: uma
                  vez criada, trocá-los seria um UPDATE no cabeçalho, que só
                  admin tem — e mudaria o registro de quem já entregou. */}
              <div className="flex flex-col gap-1.5">
                <Label>Digitou o pedido</Label>
                {requisicao ? (
                  <p className="text-[13px] text-app-text pt-[2px]">{requisicao.digitado_por_nome ?? '—'}</p>
                ) : isAdmin ? (
                  <select
                    value={digitadoPor}
                    onChange={e => onDigitadoPorChange(e.target.value)}
                    className="input-base"
                  >
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                ) : (
                  <p className="text-[13px] text-app-text pt-[2px]">{nomeUsuario}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Entregou</Label>
                {requisicao ? (
                  <p className="text-[13px] text-app-text pt-[2px]">{requisicao.entregue_por_nome ?? '—'}</p>
                ) : isAdmin ? (
                  <select
                    value={entreguePor}
                    onChange={e => onEntreguePorChange(e.target.value)}
                    className="input-base"
                  >
                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </select>
                ) : (
                  <p className="text-[13px] text-app-text pt-[2px]">{nomeUsuario}</p>
                )}
              </div>
            </div>

            <ItensLancados itens={itens} />
          </div>
        )}
      </div>

      {modalAberto && (
        <ModalRequisicoes
          onFechar={() => setModalAberto(false)}
          onSelecionar={(r) => {
            /* A ordem importa: onOpcaoChange descarta a requisição ativa (é o
               que faz "nova" e "sem requisição" começarem limpas), então a
               escolhida precisa ser aplicada depois. */
            onOpcaoChange('existente');
            onRequisicaoChange(r);
            setModalAberto(false);
          }}
        />
      )}
    </div>
  );
}
