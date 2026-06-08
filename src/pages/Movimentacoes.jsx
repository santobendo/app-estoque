import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

const Movimentacoes = ({ tipo }) => {
  const isEntrada = tipo === 'entrada';
  const Icon = isEntrada ? ArrowDownToLine : ArrowUpFromLine;
  const titulo = isEntrada ? 'Registrar Entrada' : 'Registrar Saída';

  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState('');
  const [dataMov, setDataMov] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const fetchProdutos = async () => {
    let query = supabase.from('produtos').select('*').order('nome');
    if (busca) query = query.ilike('nome', `%${busca}%`);
    const { data } = await query;
    if (data) setProdutos(data);
  };

  useEffect(() => {
    fetchProdutos();
  }, [busca]);

  const handleConfirmar = async (e) => {
    e.preventDefault();
    if (!produtoSelecionado || !quantidade || quantidade <= 0) {
      alert('Selecione um produto e informe uma quantidade válida.');
      return;
    }

    setLoading(true);
    const { data: pData } = await supabase.from('produtos').select('estoque').eq('id', produtoSelecionado.id).single();

    if (pData) {
      let novoEstoque = Number(pData.estoque);
      const qtd = Number(quantidade);

      if (!isEntrada && qtd > novoEstoque) {
        alert(`Estoque insuficiente! Saldo atual: ${novoEstoque}`);
        setLoading(false);
        return;
      }

      novoEstoque = isEntrada ? novoEstoque + qtd : novoEstoque - qtd;

      const { error: err1 } = await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', produtoSelecionado.id);

      if (!err1) {
        await supabase.from('movimentacoes').insert([{
          produto_id: produtoSelecionado.id,
          tipo,
          quantidade: qtd,
          data: new Date(dataMov).toISOString(),
        }]);

        alert('Movimentação registrada com sucesso!');
        setQuantidade('');
        setProdutoSelecionado(null);
        setBusca('');
        fetchProdutos();
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{titulo}</h1>
        <p className="text-slate-400">Registre e acompanhe todas as {isEntrada ? 'entradas' : 'saídas'} de estoque.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] min-h-0 flex-1">
        <div className="glass-panel p-6 flex flex-col gap-4">
          <h2 className={`${isEntrada ? 'text-emerald-300' : 'text-rose-300'} flex items-center gap-2 text-lg font-semibold`}>
            <Icon size={20} /> Detalhes da Movimentação
          </h2>

          <form onSubmit={handleConfirmar} className="space-y-4 flex-1 flex flex-col">
            <div className="input-group">
              <label>Produto Selecionado</label>
              <input
                type="text"
                value={produtoSelecionado ? produtoSelecionado.nome : 'Nenhum selecionado'}
                readOnly
                className={produtoSelecionado ? 'selected-input' : ''}
              />
            </div>

            <div className="input-group">
              <label>Quantidade</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 10"
                required
              />
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

        <div className="glass-panel p-6 flex flex-col gap-4 min-h-0">
          <div className="flex justify-end">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="pl-11"
                placeholder="Buscar para selecionar..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container flex-1 min-h-0">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Nome do Produto</th>
                  <th>Saldo Atual</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className={produtoSelecionado?.id === p.id ? 'row-selected' : 'even:bg-white/5'}>
                    <td className="font-semibold">{p.nome}</td>
                    <td>{Number(p.estoque).toFixed(2)}</td>
                    <td>
                      <button className="select-btn" onClick={() => setProdutoSelecionado(p)}>
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
