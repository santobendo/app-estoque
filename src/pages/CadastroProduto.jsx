import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Trash2, CheckCircle, ChevronLeft, Package, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocal } from '../contexts/LocalContext';

/* ─────────────────────────────────────────────
   Componente de rótulo de campo
───────────────────────────────────────────── */
function Label({ children, required }) {
  return (
    <label className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
      {children}
      {required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

/* ─────────────────────────────────────────────
   Tela de sucesso
───────────────────────────────────────────── */
function SuccessScreen({ onCadastrarOutro, onVerCatalogo }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl mb-0">Cadastro de Produto</h1>
      </header>

      <div className="card p-16 flex flex-col items-center gap-5 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <CheckCircle size={32} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-[17px] font-bold text-app-text mb-1">Produto cadastrado com sucesso!</p>
          <p className="text-[13px] text-app-text-secondary">
            O produto, apresentações e saldos iniciais foram salvos.
          </p>
        </div>
        <div className="flex gap-3 mt-2">
          <button className="btn btn-secondary px-5 py-2.5" onClick={onCadastrarOutro}>
            Cadastrar outro
          </button>
          <button className="btn btn-primary px-5 py-2.5" onClick={onVerCatalogo}>
            Ir para o Catálogo
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Formulário principal
───────────────────────────────────────────── */
const emptyApresentacao = (unidades = []) => ({
  descricao: '',
  quantidade_unitaria: '',
  unidade_id: unidades.length ? String(unidades[0].id) : '',
  locais: [],          // [{ local_id, quantidade_inicial }]
});

export default function CadastroProduto() {
  const navigate = useNavigate();
  const { localAtual } = useLocal();

  /* ── Dados mestres ── */
  const [categorias, setCategorias] = useState([]);
  const [unidades, setUnidades]     = useState([]);
  const [locais, setLocais]         = useState([]);
  const [loadingDados, setLoadingDados] = useState(true);

  /* ── Produto ── */
  const [nomeProduto, setNomeProduto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');

  /* ── Apresentações ── */
  const [apresentacoes, setApresentacoes] = useState([emptyApresentacao()]);

  /* ── Estado da submissão ── */
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [erros, setErros]       = useState({});

  /* ────────────────────────────────────────── */
  useEffect(() => {
    async function fetchDados() {
      const [{ data: cats }, { data: units }, { data: locs }] = await Promise.all([
        supabase.from('categorias').select('id, nome').order('nome'),
        supabase.from('unidades').select('id, sigla, nome').order('sigla'),
        supabase.from('locais').select('id, nome').eq('ativo', true).order('nome'),
      ]);

      if (cats)  setCategorias(cats);
      if (units) {
        setUnidades(units);
        // Preenche unidade_id da apresentação vazia inicial
        setApresentacoes([emptyApresentacao(units)]);
      }
      if (locs)  setLocais(locs);
      setLoadingDados(false);
    }
    fetchDados();
  }, []);

  /* ── Pré-seleciona o local da barra superior nas apresentações sem local ──
     Depende de loadingDados porque fetchDados recria a apresentação inicial. */
  useEffect(() => {
    if (!localAtual || loadingDados) return;
    setApresentacoes(prev =>
      prev.map(a =>
        a.locais.length === 0
          ? { ...a, locais: [{ local_id: localAtual.id, quantidade_inicial: '0' }] }
          : a
      )
    );
  }, [localAtual, loadingDados]);

  /* ── Helpers de apresentação ── */
  const updateApresentacao = (index, field, value) =>
    setApresentacoes(prev =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a))
    );

  const addApresentacao = () =>
    setApresentacoes(prev => [...prev, {
      ...emptyApresentacao(unidades),
      locais: localAtual ? [{ local_id: localAtual.id, quantidade_inicial: '0' }] : [],
    }]);

  const removeApresentacao = (index) =>
    setApresentacoes(prev => prev.filter((_, i) => i !== index));

  /* ── Helpers de local ── */
  const toggleLocal = (apIndex, localId) =>
    setApresentacoes(prev =>
      prev.map((a, i) => {
        if (i !== apIndex) return a;
        const exists = a.locais.find(l => l.local_id === localId);
        return {
          ...a,
          locais: exists
            ? a.locais.filter(l => l.local_id !== localId)
            : [...a.locais, { local_id: localId, quantidade_inicial: '0' }],
        };
      })
    );

  const updateLocalQtd = (apIndex, localId, qtd) =>
    setApresentacoes(prev =>
      prev.map((a, i) => {
        if (i !== apIndex) return a;
        return {
          ...a,
          locais: a.locais.map(l =>
            l.local_id === localId ? { ...l, quantidade_inicial: qtd } : l
          ),
        };
      })
    );

  /* ── Validação ── */
  const validate = () => {
    const novosErros = {};
    if (!nomeProduto.trim()) {
      novosErros.nomeProduto = 'Nome do produto é obrigatório.';
    }
    apresentacoes.forEach((a, i) => {
      if (!a.quantidade_unitaria || Number(a.quantidade_unitaria) <= 0) {
        novosErros[`ap_${i}_qtd`] = 'Quantidade deve ser maior que zero.';
      }
      if (!a.unidade_id) {
        novosErros[`ap_${i}_unidade`] = 'Selecione uma unidade.';
      }
    });
    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  };

  /* ── Submissão ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    /* 1 — Inserir produto */
    const { data: prodData, error: errProd } = await supabase
      .from('produtos')
      .insert([{
        nome: nomeProduto.trim().toUpperCase(),
        categoria_id: categoriaId ? Number(categoriaId) : null,
      }])
      .select('id')
      .single();

    if (errProd) {
      setLoading(false);
      alert(
        errProd.message.toLowerCase().includes('duplicate')
          ? 'Já existe um produto com esse nome.'
          : 'Erro ao cadastrar produto: ' + errProd.message
      );
      return;
    }

    /* 2 — Inserir apresentações e estoques */
    for (const ap of apresentacoes) {
      const { data: apData, error: errAp } = await supabase
        .from('apresentacoes')
        .insert([{
          produto_id: prodData.id,
          descricao: ap.descricao.trim() || nomeProduto.trim().toUpperCase(),
          quantidade_unitaria: Number(ap.quantidade_unitaria),
          unidade_id: Number(ap.unidade_id),
        }])
        .select('id')
        .single();

      if (errAp) {
        setLoading(false);
        alert('Erro ao cadastrar apresentação: ' + errAp.message);
        return;
      }

      /* 3 — Criar estoques para cada local selecionado */
      for (const loc of ap.locais) {
        const { error: errEst } = await supabase
          .from('estoques')
          .insert([{
            apresentacao_id: apData.id,
            local_id: loc.local_id,
            quantidade_atual: Math.max(Number(loc.quantidade_inicial) || 0, 0),
          }]);

        if (errEst) {
          console.warn('Erro ao criar estoque:', errEst.message);
        }
      }
    }

    setLoading(false);
    setSuccess(true);
  };

  /* ── Reset para novo cadastro ── */
  const resetForm = () => {
    setNomeProduto('');
    setCategoriaId('');
    setApresentacoes([emptyApresentacao(unidades)]);
    setErros({});
    setSuccess(false);
  };

  /* ─────────── Tela de sucesso ─────────── */
  if (success) {
    return (
      <SuccessScreen
        onCadastrarOutro={resetForm}
        onVerCatalogo={() => navigate('/')}
      />
    );
  }

  /* ─────────── Formulário ─────────── */
  return (
    <div className="flex flex-col gap-5">

      {/* Cabeçalho */}
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="p-1.5 rounded-lg hover:bg-app-border/60 text-app-text-secondary hover:text-app-text transition-all"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl mb-0.5">Novo Produto</h1>
          <p className="text-[13px] text-app-text-secondary">
            Preencha os dados do produto e suas embalagens.
          </p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

        {/* ══════════ Seção 1 — Produto ══════════ */}
        <div className="card">
          <SectionHeader number="1" title="Produto" />

          <div className="p-6 grid grid-cols-2 gap-4">
            {/* Nome */}
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label required>Nome do Produto</Label>
              <input
                type="text"
                value={nomeProduto}
                onChange={(e) => setNomeProduto(e.target.value.toUpperCase())}
                placeholder="Ex: ÁGUA SANITÁRIA"
                className={`input-base ${erros.nomeProduto ? 'border-rose-400 focus:border-rose-400' : ''}`}
              />
              {erros.nomeProduto && (
                <span className="text-rose-500 text-[11px]">{erros.nomeProduto}</span>
              )}
            </div>

            {/* Categoria */}
            <div className="flex flex-col gap-1.5">
              <Label>Categoria</Label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="input-base"
              >
                <option value="">Sem categoria</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ══════════ Seção 2 — Apresentações ══════════ */}
        <div className="card">
          <div className="px-6 py-4 border-b border-app-border-inner flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-app-text text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                2
              </span>
              <div>
                <span className="text-[13px] font-bold text-app-text uppercase tracking-wide">
                  Apresentações
                </span>
                <span className="text-[11px] text-app-text-secondary ml-2">
                  embalagens / tamanhos
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={addApresentacao}
              className="btn btn-secondary flex items-center gap-1.5 text-[12px]"
            >
              <Plus size={13} />
              Adicionar
            </button>
          </div>

          <div className="divide-y divide-app-border-inner">
            {apresentacoes.map((ap, i) => (
              <ApresentacaoCard
                key={i}
                index={i}
                ap={ap}
                unidades={unidades}
                locais={locais}
                erros={erros}
                total={apresentacoes.length}
                onUpdate={updateApresentacao}
                onRemove={removeApresentacao}
                onToggleLocal={toggleLocal}
                onUpdateLocalQtd={updateLocalQtd}
              />
            ))}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            className="btn btn-secondary px-5 py-2.5"
            onClick={() => navigate('/')}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary flex items-center gap-2 px-6 py-2.5 text-[13px]"
            disabled={loading || loadingDados}
          >
            {loading ? (
              <>
                <Spinner />
                Salvando...
              </>
            ) : (
              <>
                <Package size={15} />
                Cadastrar Produto
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Sub-componentes
───────────────────────────────────────────── */
function SectionHeader({ number, title }) {
  return (
    <div className="px-6 py-4 border-b border-app-border-inner flex items-center gap-3">
      <span className="w-6 h-6 rounded-full bg-app-text text-white flex items-center justify-center text-[11px] font-bold shrink-0">
        {number}
      </span>
      <span className="text-[13px] font-bold text-app-text uppercase tracking-wide">
        {title}
      </span>
    </div>
  );
}

function ApresentacaoCard({
  index, ap, unidades, locais, erros, total,
  onUpdate, onRemove, onToggleLocal, onUpdateLocalQtd,
}) {
  return (
    <div className="p-6 flex flex-col gap-4">
      {/* Cabeçalho da apresentação */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
          Apresentação #{index + 1}
        </span>
        {total > 1 && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="flex items-center gap-1.5 text-[11px] text-app-text-label hover:text-rose-500 transition-colors font-medium"
          >
            <Trash2 size={13} />
            Remover
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Descrição da embalagem */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Descrição da Embalagem</Label>
          <input
            type="text"
            value={ap.descricao}
            onChange={(e) => onUpdate(index, 'descricao', e.target.value)}
            placeholder="Ex: Galão 5L, Frasco 500ml, Rolo..."
            className="input-base"
          />
        </div>

        {/* Quantidade unitária */}
        <div className="flex flex-col gap-1.5">
          <Label required>Quantidade Unitária</Label>
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            value={ap.quantidade_unitaria}
            onChange={(e) => onUpdate(index, 'quantidade_unitaria', e.target.value)}
            placeholder="Ex: 5"
            className={`input-base ${erros[`ap_${index}_qtd`] ? 'border-rose-400' : ''}`}
          />
          {erros[`ap_${index}_qtd`] && (
            <span className="text-rose-500 text-[11px]">{erros[`ap_${index}_qtd`]}</span>
          )}
        </div>

        {/* Unidade */}
        <div className="flex flex-col gap-1.5">
          <Label required>Unidade de Medida</Label>
          <select
            value={ap.unidade_id}
            onChange={(e) => onUpdate(index, 'unidade_id', e.target.value)}
            className="input-base"
          >
            {unidades.map(u => (
              <option key={u.id} value={u.id}>
                {u.sigla} — {u.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Locais de estoque */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={13} className="text-app-text-label" />
          <Label>Locais de Estoque</Label>
          <span className="text-[10px] text-app-text-label normal-case tracking-normal font-normal">
            — selecione os locais e informe a quantidade inicial
          </span>
        </div>

        {locais.length === 0 ? (
          <p className="text-[12px] text-app-text-secondary">Nenhum local cadastrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {locais.map(loc => {
              const selecionado = ap.locais.find(l => l.local_id === loc.id);
              return (
                <div
                  key={loc.id}
                  onClick={() => onToggleLocal(index, loc.id)}
                  className={`
                    border rounded-xl p-3 flex items-center gap-3 cursor-pointer
                    transition-all duration-150 select-none
                    ${selecionado
                      ? 'border-app-text bg-app-bg shadow-sm'
                      : 'border-app-border hover:border-app-text-label hover:bg-app-bg/40'
                    }
                  `}
                >
                  {/* Checkbox customizado */}
                  <div
                    className={`
                      w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0
                      transition-all duration-150
                      ${selecionado ? 'bg-app-text border-app-text' : 'border-app-border-inner bg-white'}
                    `}
                  >
                    {selecionado && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  <span className="text-[13px] font-medium text-app-text flex-1">{loc.nome}</span>

                  {/* Qtd inicial (só quando selecionado) */}
                  {selecionado && (
                    <div
                      className="flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] text-app-text-label uppercase tracking-wider font-bold">
                        Qtd:
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={selecionado.quantidade_inicial}
                        onChange={(e) => onUpdateLocalQtd(index, loc.id, e.target.value)}
                        className="w-16 input-base py-1 px-2 text-center text-[12px] font-bold"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
