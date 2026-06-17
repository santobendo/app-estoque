import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

const Movimentacoes = ({ tipo }) => {
  const isEntrada = tipo === 'entrada';
  const Icon = isEntrada ? ArrowDownToLine : ArrowUpFromLine;
  const titulo = isEntrada ? 'Registrar Entrada' : 'Registrar Saída';

  const [estoques, setEstoques] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [busca, setBusca] = useState('');
  const [estoqueSelecionado, setEstoqueSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState('');
  const [motivoId, setMotivoId] = useState('');
  const [dataMov, setDataMov] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);

  const fetchEstoques = async () => {
    let query = supabase
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

    const { data } = await query;
    if (data) {
      // Filtra client-side pelo busca
      setEstoques(data);
    }
  };

  const fetchMotivos = async () => {
    const { data } = await supabase.from('motivos_movimentacao').select('id, codigo, descricao').order('id');
    if (data) {
      setMotivos(data);
      // Pré-seleciona motivo padrão baseado no tipo
      const defaultCodigo = isEntrada ? 'compra' : 'uso';
      const def = data.find(m => m.codigo === defaultCodigo);
      if (def) setMotivoId(String(def.id));
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
    fetchEstoques();
    fetchMotivos();
  }, []);

  const estoquesFiltrados = estoques.filter(e => {
    if (!busca) return true;
    const nome = e.apresentacoes?.produtos?.nome || '';
    const apresentacao = e.apresentacoes?.descricao || '';
    const local = e.locais?.nome || '';
    const termo = busca.toLowerCase();
    return nome.toLowerCase().includes(termo) || apresentacao.toLowerCase().includes(termo) || local.toLowerCase().includes(termo);
  });

  const handleConfirmar = async (e) => {
    e.preventDefault();
    if (!estoqueSelecionado || !quantidade || Number(quantidade) <= 0) {
      alert('Selecione um item e informe uma quantidade válida.');
      return;
    }
    if (!user) {
      alert('Usuário não autenticado.');
      return;
    }

    const qtd = Number(quantidade);

    // Verificação de saldo suficiente para saída
    if (!isEntrada && qtd > Number(estoqueSelecionado.quantidade_atual)) {
      alert(`Estoque insuficiente! Saldo atual: ${Number(estoqueSelecionado.quantidade_atual).toFixed(4)}`);
      return;
    }

    setLoading(true);

    const { error } = await supabase.from('movimentacoes').insert([{
      estoque_id: estoqueSelecionado.id,
      criado_por: user.id,
      tipo,
      quantidade: qtd,
      motivo_id: motivoId ? Number(motivoId) : null,
      data: new Date(dataMov).toISOString(),
    }]);

    if (error) {
      alert('Erro ao registrar movimentação: ' + error.message);
    } else {
      alert('Movimentação registrada com sucesso!');
      setQuantidade('');
      setEstoqueSelecionado(null);
      setBusca('');
      fetchEstoques(); // atualiza saldos
    }

    setLoading(false);
  };

  const getNomeProduto = (e) => {
    const nome = e.apresentacoes?.produtos?.nome || 'Desconhecido';
    const apresentacao = e.apresentacoes?.descricao || '';
    const local = e.locais?.nome || '';
    return `${nome} — ${apresentacao} (${local})`;
  };

  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{titulo}</h1>
        <p className="text-slate-400">Registre e acompanhe todas as {isEntrada ? 'entradas' : 'saídas'} de estoque.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] min-h-0 flex-1">
        {/* Painel do formulário */}
        <div className="glass-panel p-6 flex flex-col gap-4">
          <h2 className={`${isEntrada ? 'text-emerald-300' : 'text-rose-300'} flex items-center gap-2 text-lg font-semibold`}>
            <Icon size={20} /> Detalhes da Movimentação
          </h2>

          <form onSubmit={handleConfirmar} className="space-y-4 flex-1 flex flex-col">
            <div className="input-group">
              <label>Item Selecionado</label>
              <input
                type="text"
                value={estoqueSelecionado ? getNomeProduto(estoqueSelecionado) : 'Nenhum selecionado'}
                readOnly
                className={estoqueSelecionado ? 'selected-input' : ''}
              />
            </div>

            {estoqueSelecionado && (
              <div className="text-xs text-slate-400 -mt-2 px-1">
                Saldo atual: <span className="font-bold text-slate-200">{Number(estoqueSelecionado.quantidade_atual).toFixed(4)}</span>
                {' '}{estoqueSelecionado.apresentacoes?.unidades?.sigla}
              </div>
            )}

            <div className="input-group">
              <label>Quantidade</label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 10"
                required
              />
            </div>

            <div className="input-group">
              <label>Motivo</label>
              <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
                <option value="">Sem motivo</option>
                {motivos.map(m => (
                  <option key={m.id} value={m.id}>{m.descricao}</option>
                ))}
              </select>
            </div>

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
              className={`btn ${isEntrada ? 'btn-primary' : 'btn-danger'} w-full mt-auto py-3`}
              disabled={loading}
            >
              <Icon size={18} /> Confirmar {isEntrada ? 'Entrada' : 'Saída'}
            </button>
          </form>
        </div>

        {/* Painel de seleção */}
        <div className="glass-panel p-6 flex flex-col gap-4 min-h-0">
          <div className="flex justify-end">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="pl-11"
                placeholder="Buscar por produto ou local..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container flex-1 min-h-0">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Produto / Apresentação</th>
                  <th>Local</th>
                  <th>Saldo</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {estoquesFiltrados.map((e) => (
                  <tr key={e.id} className={estoqueSelecionado?.id === e.id ? 'row-selected' : 'even:bg-white/5'}>
                    <td>
                      <div className="font-semibold">{e.apresentacoes?.produtos?.nome}</div>
                      <div className="text-xs text-slate-400">{e.apresentacoes?.descricao}</div>
                    </td>
                    <td className="text-sm">{e.locais?.nome}</td>
                    <td>
                      <span className={Number(e.quantidade_atual) === 0 ? 'text-rose-400 font-bold' : ''}>
                        {Number(e.quantidade_atual).toFixed(2)}
                      </span>
                      {' '}<span className="text-xs text-slate-500">{e.apresentacoes?.unidades?.sigla}</span>
                    </td>
                    <td>
                      <button className="select-btn" onClick={() => setEstoqueSelecionado(e)}>
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

export default Movimentacoes;
