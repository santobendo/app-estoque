import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useLocal } from '../contexts/LocalContext';
import {
  Search, ArrowDownCircle, ArrowUpCircle, CheckCircle, RotateCcw, AlertCircle, X,
} from 'lucide-react';
import { traduzErro } from '../components/TabelaCrud';

/* ─── helpers ─── */
function Label({ children, required }) {
  return (
    <label className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
      {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

function SectionHeader({ number, title, subtitle }) {
  return (
    <div className="px-6 py-4 border-b border-app-border-inner flex items-center gap-3">
      <span className="w-6 h-6 rounded-full bg-app-text text-white flex items-center justify-center text-[11px] font-bold shrink-0">
        {number}
      </span>
      <span className="text-[13px] font-bold text-app-text uppercase tracking-wide">{title}</span>
      {subtitle && <span className="text-[11px] text-app-text-secondary">{subtitle}</span>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ─── componente de busca de produto ─── */
function ProdutoBusca({ onSelect }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!busca.trim()) { setResultados([]); return; }
    const timer = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from('produtos')
        .select('id, nome, categorias(nome)')
        .ilike('nome', `%${busca}%`)
        .order('nome')
        .limit(10);
      setResultados(data ?? []);
      setAberto(true);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [busca]);

  const selecionar = (produto) => {
    setBusca(produto.nome);
    setAberto(false);
    setResultados([]);
    onSelect(produto);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label" size={15} />
        <input
          type="text"
          value={busca}
          onChange={(e) => { setBusca(e.target.value); onSelect(null); }}
          placeholder="Buscar produto pelo nome..."
          className="input-base w-full pl-9"
        />
        {buscando && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-app-text-label">
            <Spinner />
          </span>
        )}
      </div>
      {aberto && resultados.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-app-border rounded-xl shadow-lg overflow-hidden">
          {resultados.map(p => (
            <li
              key={p.id}
              onClick={() => selecionar(p)}
              className="px-4 py-2.5 cursor-pointer hover:bg-app-bg flex items-center justify-between"
            >
              <span className="text-[13px] font-semibold text-app-text">{p.nome}</span>
              {p.categorias?.nome && (
                <span className="text-[11px] text-app-text-secondary">{p.categorias.nome}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {aberto && resultados.length === 0 && busca.trim() && !buscando && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-app-border rounded-xl shadow-lg px-4 py-3 text-[13px] text-app-text-secondary">
          Nenhum produto encontrado.
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Página principal
═══════════════════════════════════════════ */
export default function Movimentacoes() {
  const { user } = useAuth();
  const { localAtual } = useLocal();

  /* ── dados mestres ── */
  const [motivos, setMotivos]       = useState([]);
  const [apresentacoes, setApresentacoes] = useState([]);
  const [estoques, setEstoques]     = useState([]); // estoques da apresentação selecionada

  /* ── seleções ── */
  const [produto, setProduto]           = useState(null);
  const [apresentacaoId, setApresentacaoId] = useState('');
  const [estoqueId, setEstoqueId]       = useState('');
  const [tipo, setTipo]                 = useState('saida');
  const [motivoId, setMotivoId]         = useState('');
  const [quantidade, setQuantidade]     = useState('');
  const [data, setData]                 = useState(() => new Date().toISOString().slice(0, 16));

  /* ── estado ── */
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [erros, setErros]       = useState({});
  const [erroSubmit, setErroSubmit] = useState(null);
  const [estoqueAtual, setEstoqueAtual] = useState(null);

  /* ─ Carrega motivos ─ */
  useEffect(() => {
    supabase.from('motivos_movimentacao').select('id, codigo, descricao').order('descricao')
      .then(({ data }) => {
        if (data) {
          setMotivos(data);
          setMotivoId(String(data[0]?.id ?? ''));
        }
      });
  }, []);

  /* ─ Carrega apresentações quando produto muda ─ */
  useEffect(() => {
    setApresentacaoId('');
    setEstoques([]);
    setEstoqueId('');
    setEstoqueAtual(null);
    if (!produto) { setApresentacoes([]); return; }

    supabase
      .from('apresentacoes')
      .select('id, descricao, quantidade_unitaria, unidades(sigla)')
      .eq('produto_id', produto.id)
      .order('descricao')
      .then(({ data }) => {
        setApresentacoes(data ?? []);
        if (data?.length) setApresentacaoId(String(data[0].id));
      });
  }, [produto]);

  /* ─ Carrega o estoque da apresentação no local selecionado na barra ─ */
  useEffect(() => {
    setEstoqueId('');
    setEstoqueAtual(null);
    if (!apresentacaoId || !localAtual) { setEstoques([]); return; }

    supabase
      .from('estoques')
      .select('id, quantidade_atual, locais(id, nome)')
      .eq('apresentacao_id', Number(apresentacaoId))
      .eq('local_id', localAtual.id)
      .then(({ data }) => {
        setEstoques(data ?? []);
        if (data?.length) {
          setEstoqueId(String(data[0].id));
          setEstoqueAtual(Number(data[0].quantidade_atual));
        }
      });
  }, [apresentacaoId, localAtual]);

  /* ─ Atualiza estoque atual quando local muda ─ */
  useEffect(() => {
    const est = estoques.find(e => String(e.id) === estoqueId);
    setEstoqueAtual(est ? Number(est.quantidade_atual) : null);
  }, [estoqueId, estoques]);

  /* ─ Filtra motivos conforme tipo ─ */
  const motivosFiltrados = motivos.filter(m => {
    if (tipo === 'entrada') return ['compra', 'ajuste', 'outro'].includes(m.codigo);
    return ['uso', 'descarte', 'ajuste', 'outro'].includes(m.codigo);
  });

  useEffect(() => {
    if (motivosFiltrados.length) setMotivoId(String(motivosFiltrados[0].id));
  }, [tipo]);

  /* ─ Validação ─ */
  const validate = () => {
    const e = {};
    if (!produto)           e.produto      = 'Selecione um produto.';
    if (!apresentacaoId)    e.apresentacao = 'Selecione uma apresentação.';
    if (!estoqueId)         e.estoque      = `Esta apresentação não está vinculada ao local ${localAtual?.nome ?? 'selecionado'}.`;
    if (!quantidade || Number(quantidade) <= 0)
                            e.quantidade   = 'Informe uma quantidade maior que zero.';
    if (tipo === 'saida' && estoqueAtual !== null && Number(quantidade) > estoqueAtual)
                            e.quantidade   = `Estoque insuficiente. Disponível: ${estoqueAtual}`;
    setErros(e);
    return Object.keys(e).length === 0;
  };

  /* ─ Submissão ─ */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErroSubmit(null);
    if (!validate()) return;
    setLoading(true);

    const { error } = await supabase.from('movimentacoes').insert([{
      estoque_id: Number(estoqueId),
      criado_por: user.id,
      tipo,
      quantidade: Number(quantidade),
      motivo_id: motivoId ? Number(motivoId) : null,
      data: new Date(data).toISOString(),
    }]);

    setLoading(false);

    if (error) {
      setErroSubmit(traduzErro(error));
    } else {
      setSuccess(true);
      resetForm();
    }
  };

  const resetForm = () => {
    setProduto(null);
    setApresentacaoId('');
    setEstoqueId('');
    setQuantidade('');
    setData(new Date().toISOString().slice(0, 16));
    setErros({});
  };

  const apSelecionada = apresentacoes.find(a => String(a.id) === apresentacaoId);

  return (
    <div className="flex flex-col gap-5">

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl mb-0.5">Movimentações</h1>
          <p className="text-[13px] text-app-text-secondary">
            {localAtual
              ? <>Registre entradas e saídas em <span className="font-semibold text-app-text">{localAtual.nome}</span>.</>
              : 'Selecione um local na barra superior para registrar movimentações.'}
          </p>
        </div>
      </header>

      {success && (
        <div className="card px-5 py-4 flex items-center justify-between gap-4 border-l-4 border-emerald-500">
          <div className="flex items-center gap-3">
            <CheckCircle size={20} className="text-emerald-500 shrink-0" />
            <span className="text-[13px] font-semibold text-app-text">
              Movimentação registrada com sucesso!
            </span>
          </div>
          <button
            className="btn btn-secondary flex items-center gap-1.5 text-[12px]"
            onClick={() => setSuccess(false)}
          >
            <RotateCcw size={13} /> Nova movimentação
          </button>
        </div>
      )}

      {erroSubmit && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[13px]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{erroSubmit}</span>
          <button onClick={() => setErroSubmit(null)} className="p-1 hover:text-rose-900"><X size={14} /></button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

        {/* ── Tipo ── */}
        <div className="card">
          <SectionHeader number="1" title="Tipo de Movimentação" />
          <div className="p-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTipo('saida')}
              className={`flex items-center gap-3 p-4 rounded-xl border-[1.5px] transition-all cursor-pointer ${
                tipo === 'saida'
                  ? 'border-rose-400 bg-rose-50 text-rose-700'
                  : 'border-app-border hover:border-rose-200 text-app-text-secondary'
              }`}
            >
              <ArrowUpCircle size={22} />
              <div className="text-left">
                <p className="text-[13px] font-bold">Saída</p>
                <p className="text-[11px] opacity-75">Consumo, descarte ou retirada</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('entrada')}
              className={`flex items-center gap-3 p-4 rounded-xl border-[1.5px] transition-all cursor-pointer ${
                tipo === 'entrada'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-app-border hover:border-emerald-200 text-app-text-secondary'
              }`}
            >
              <ArrowDownCircle size={22} />
              <div className="text-left">
                <p className="text-[13px] font-bold">Entrada</p>
                <p className="text-[11px] opacity-75">Compra, recebimento ou ajuste</p>
              </div>
            </button>
          </div>
        </div>

        {/* ── Produto ── */}
        <div className="card">
          <SectionHeader number="2" title="Produto" />
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label required>Produto</Label>
              <ProdutoBusca onSelect={setProduto} />
              {erros.produto && <span className="text-rose-500 text-[11px]">{erros.produto}</span>}
            </div>

            {/* Apresentação */}
            {apresentacoes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label required>Apresentação / Embalagem</Label>
                <select
                  value={apresentacaoId}
                  onChange={e => setApresentacaoId(e.target.value)}
                  className={`input-base ${erros.apresentacao ? 'border-rose-400' : ''}`}
                >
                  {apresentacoes.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.descricao} ({a.quantidade_unitaria} {a.unidades?.sigla})
                    </option>
                  ))}
                </select>
                {erros.apresentacao && <span className="text-rose-500 text-[11px]">{erros.apresentacao}</span>}
              </div>
            )}

            {/* Apresentação sem vínculo com o local atual */}
            {apresentacaoId && localAtual && estoques.length === 0 && (
              <div className="col-span-2 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-[12px]">
                <AlertCircle size={14} className="shrink-0" />
                <span className="flex-1">
                  Esta apresentação não está vinculada ao local{' '}
                  <span className="font-bold">{localAtual.nome}</span>.{' '}
                  {produto && (
                    <Link to={`/produtos/${produto.id}`} className="font-bold underline hover:no-underline">
                      Vincular na tela do produto
                    </Link>
                  )}
                </span>
              </div>
            )}

            {/* Estoque atual badge */}
            {estoqueAtual !== null && apSelecionada && localAtual && (
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-[11px] text-app-text-label">
                  Saldo atual em {localAtual.nome}:
                </span>
                <span className={`text-[13px] font-bold ${estoqueAtual === 0 ? 'text-rose-500' : 'text-app-text'}`}>
                  {estoqueAtual} emb. de {Number(apSelecionada.quantidade_unitaria)} {apSelecionada.unidades?.sigla}
                </span>
              </div>
            )}
            {erros.estoque && !estoqueId && (
              <span className="col-span-2 text-rose-500 text-[11px]">{erros.estoque}</span>
            )}
          </div>
        </div>

        {/* ── Detalhes ── */}
        <div className="card">
          <SectionHeader number="3" title="Detalhes da Movimentação" />
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label required>Quantidade</Label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                placeholder="Ex: 3"
                className={`input-base ${erros.quantidade ? 'border-rose-400' : ''}`}
              />
              {erros.quantidade && <span className="text-rose-500 text-[11px]">{erros.quantidade}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label required>Motivo</Label>
              <select
                value={motivoId}
                onChange={e => setMotivoId(e.target.value)}
                className="input-base"
              >
                {motivosFiltrados.map(m => (
                  <option key={m.id} value={m.id}>{m.descricao}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Data / Hora</Label>
              <input
                type="datetime-local"
                value={data}
                onChange={e => setData(e.target.value)}
                className="input-base"
              />
            </div>
          </div>
        </div>

        {/* ── Ações ── */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" className="btn btn-secondary px-5 py-2.5" onClick={resetForm}>
            Limpar
          </button>
          <button
            type="submit"
            disabled={loading || !produto}
            className={`btn btn-primary flex items-center gap-2 px-6 py-2.5 text-[13px] ${
              tipo === 'entrada' ? '' : 'bg-rose-600 hover:opacity-90'
            }`}
          >
            {loading ? <Spinner /> : tipo === 'entrada'
              ? <ArrowDownCircle size={15} />
              : <ArrowUpCircle size={15} />}
            {loading ? 'Salvando...' : tipo === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
          </button>
        </div>
      </form>
    </div>
  );
}
