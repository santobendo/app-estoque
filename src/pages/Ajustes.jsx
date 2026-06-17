import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Settings2 } from 'lucide-react';

const Ajustes = () => {
  const [estoques, setEstoques] = useState([]);
  const [busca, setBusca] = useState('');
  const [estoqueSelecionado, setEstoqueSelecionado] = useState(null);
  const [novoSaldo, setNovoSaldo] = useState('');
  const [dataMov, setDataMov] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [motivoAjusteId, setMotivoAjusteId] = useState(null);
  const [user, setUser] = useState(null);

  const fetchDados = async () => {
    // Buscar estoques com joins
    const { data: estData } = await supabase
      .from('estoques')
      .select(`
        id,
        quantidade_atual,
        apresentacoes (
          id,
          descricao,
          quantidade_unitaria,
          unidades ( sigla ),
          produtos ( id, nome )
        ),
        locais ( id, nome )
      `)
      .order('id');

    if (estData) setEstoques(estData);

    // Buscar id do motivo 'ajuste'
    const { data: motivoData } = await supabase
      .from('motivos_movimentacao')
      .select('id')
      .eq('codigo', 'ajuste')
      .single();

    if (motivoData) setMotivoAjusteId(motivoData.id);
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
    fetchDados();
  }, []);

  const estoquesFiltrados = estoques.filter(e => {
    if (!busca) return true;
    const nome = e.apresentacoes?.produtos?.nome || '';
    const apresentacao = e.apresentacoes?.descricao || '';
    const local = e.locais?.nome || '';
    const termo = busca.toLowerCase();
    return (
      nome.toLowerCase().includes(termo) ||
      apresentacao.toLowerCase().includes(termo) ||
      local.toLowerCase().includes(termo)
    );
  });

  const handleConfirmar = async (e) => {
    e.preventDefault();
    if (!estoqueSelecionado || novoSaldo === '' || Number(novoSaldo) < 0) {
      alert('Selecione um item e informe um saldo válido (≥ 0).');
      return;
    }
    if (!user) {
      alert('Usuário não autenticado.');
      return;
    }

    const saldoAnterior = Number(estoqueSelecionado.quantidade_atual);
    const saldoFinal = Number(novoSaldo);
    const diff = saldoFinal - saldoAnterior;

    if (diff === 0) {
      alert('O novo saldo é igual ao saldo atual. Nenhuma alteração necessária.');
      return;
    }

    setLoading(true);

    // O novo schema só permite quantidade > 0 e tipo entrada/saida.
    // Um ajuste positivo = entrada; negativo = saída.
    const tipoMov = diff > 0 ? 'entrada' : 'saida';
    const qtd = Math.abs(diff);

    const { error } = await supabase.from('movimentacoes').insert([{
      estoque_id: estoqueSelecionado.id,
      criado_por: user.id,
      tipo: tipoMov,
      quantidade: qtd,
      motivo_id: motivoAjusteId,
      data: new Date(dataMov).toISOString(),
    }]);

    if (error) {
      alert('Erro ao registrar ajuste: ' + error.message);
    } else {
      alert(`Ajuste registrado! Saldo alterado de ${saldoAnterior.toFixed(4)} para ${saldoFinal.toFixed(4)}.`);
      setNovoSaldo('');
      setEstoqueSelecionado(null);
      setBusca('');
      fetchDados();
    }

    setLoading(false);
  };

  const getNomeCompleto = (e) => {
    const nome = e.apresentacoes?.produtos?.nome || 'Desconhecido';
    const ap = e.apresentacoes?.descricao || '';
    const local = e.locais?.nome || '';
    return `${nome} — ${ap} (${local})`;
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Ajuste de Inventário</h1>
        <p>Ajuste o saldo de itens baseado em contagem física.</p>
      </div>

      <div className="management-grid">
        {/* Formulário */}
        <div className="glass-panel form-panel p-6">
          <h2 className="flex items-center gap-2 mb-6 text-amber-300 font-semibold">
            <Settings2 size={20} /> Definir Saldo Final
          </h2>
          <form onSubmit={handleConfirmar} className="space-y-4">
            <div className="input-group">
              <label>Item Selecionado</label>
              <input
                type="text"
                value={estoqueSelecionado ? getNomeCompleto(estoqueSelecionado) : 'Nenhum selecionado'}
                readOnly
                className={estoqueSelecionado ? 'selected-input' : ''}
              />
            </div>

            {estoqueSelecionado && (
              <div className="text-xs text-slate-400 -mt-2 px-1">
                Saldo no sistema:{' '}
                <span className="font-bold text-slate-200">
                  {Number(estoqueSelecionado.quantidade_atual).toFixed(4)}
                </span>{' '}
                {estoqueSelecionado.apresentacoes?.unidades?.sigla}
              </div>
            )}

            <div className="input-group">
              <label>Novo Saldo</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={novoSaldo}
                onChange={(e) => setNovoSaldo(e.target.value)}
                placeholder="Saldo contado fisicamente"
                required
              />
            </div>

            {novoSaldo !== '' && estoqueSelecionado && (
              <div className={`text-xs px-1 ${Number(novoSaldo) - Number(estoqueSelecionado.quantidade_atual) > 0 ? 'text-emerald-400' : Number(novoSaldo) - Number(estoqueSelecionado.quantidade_atual) < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                Diferença:{' '}
                {Number(novoSaldo) - Number(estoqueSelecionado.quantidade_atual) > 0 ? '+' : ''}
                {(Number(novoSaldo) - Number(estoqueSelecionado.quantidade_atual)).toFixed(4)}{' '}
                {estoqueSelecionado.apresentacoes?.unidades?.sigla}
              </div>
            )}

            <div className="input-group">
              <label>Data</label>
              <input
                type="date"
                value={dataMov}
                onChange={(e) => setDataMov(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn w-full bg-amber-500 hover:bg-amber-600 text-white font-bold mt-4"
              disabled={loading}
            >
              <Settings2 size={18} /> Confirmar Ajuste
            </button>
          </form>
        </div>

        {/* Lista de estoques */}
        <div className="glass-panel table-panel p-6 flex flex-col gap-4">
          <div className="table-header-actions">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar para ajustar..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container flex-1 min-h-0">
            <table>
              <thead>
                <tr>
                  <th>Produto / Apresentação</th>
                  <th>Local</th>
                  <th>Saldo Atual</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {estoquesFiltrados.map((e) => (
                  <tr key={e.id} className={estoqueSelecionado?.id === e.id ? 'row-selected' : ''}>
                    <td>
                      <div className="font-medium">{e.apresentacoes?.produtos?.nome}</div>
                      <div className="text-xs text-slate-400">{e.apresentacoes?.descricao}</div>
                    </td>
                    <td className="text-sm">{e.locais?.nome}</td>
                    <td>
                      {Number(e.quantidade_atual).toFixed(2)}{' '}
                      <span className="text-xs text-slate-500">{e.apresentacoes?.unidades?.sigla}</span>
                    </td>
                    <td>
                      <button
                        className="btn select-btn"
                        onClick={() => {
                          setEstoqueSelecionado(e);
                          setNovoSaldo('');
                        }}
                      >
                        Selecionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Ajustes;
