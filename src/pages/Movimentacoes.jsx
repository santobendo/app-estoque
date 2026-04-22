import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import './Movimentacoes.css';

const Movimentacoes = ({ tipo }) => {
  const isEntrada = tipo === 'entrada';
  const Icon = isEntrada ? ArrowDownToLine : ArrowUpFromLine;
  const titulo = isEntrada ? 'Registrar Entrada' : 'Registrar Saída';
  const colorClass = isEntrada ? 'text-success' : 'text-danger';

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
      alert("Selecione um produto e informe uma quantidade válida.");
      return;
    }

    setLoading(true);
    
    // Check current stock first to prevent negative if it's a "saida"
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

      // Update stock
      const { error: err1 } = await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', produtoSelecionado.id);
      
      if (!err1) {
        // Insert movement
        await supabase.from('movimentacoes').insert([{
          produto_id: produtoSelecionado.id,
          tipo: tipo,
          quantidade: qtd,
          data: new Date(dataMov).toISOString()
        }]);
        
        alert("Movimentação registrada com sucesso!");
        setQuantidade('');
        setProdutoSelecionado(null);
        setBusca('');
        fetchProdutos();
      }
    }
    setLoading(false);
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>{titulo}</h1>
      </div>

      <div className="management-grid">
        <div className="glass-panel form-panel">
          <h2 className={colorClass} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icon size={20} /> Detalhes da Movimentação
          </h2>
          <form onSubmit={handleConfirmar}>
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

            <button type="submit" className={`btn ${isEntrada ? 'btn-primary' : 'btn-danger'}`} style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              <Icon size={18} /> Confirmar {isEntrada ? 'Entrada' : 'Saída'}
            </button>
          </form>
        </div>

        <div className="glass-panel table-panel">
          <div className="table-header-actions">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Buscar para selecionar..." 
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nome do Produto</th>
                  <th>Saldo Atual</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className={produtoSelecionado?.id === p.id ? 'row-selected' : ''}>
                    <td style={{fontWeight: 500}}>{p.nome}</td>
                    <td>{Number(p.estoque).toFixed(2)}</td>
                    <td>
                      <button 
                        className="btn select-btn"
                        onClick={() => setProdutoSelecionado(p)}
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

export default Movimentacoes;
