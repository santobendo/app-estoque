import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Settings2 } from 'lucide-react';

const Ajustes = () => {
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [novoSaldo, setNovoSaldo] = useState('');
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
    if (!produtoSelecionado || novoSaldo === '' || novoSaldo < 0) {
      alert("Selecione um produto e informe um saldo válido (≥ 0).");
      return;
    }

    setLoading(true);
    
    // Fetch current stock
    const { data: pData } = await supabase.from('produtos').select('estoque').eq('id', produtoSelecionado.id).single();
    
    if (pData) {
      const saldoAnterior = Number(pData.estoque);
      const saldoFinal = Number(novoSaldo);
      const diff = saldoFinal - saldoAnterior;

      // Update stock
      const { error: err1 } = await supabase.from('produtos').update({ estoque: saldoFinal }).eq('id', produtoSelecionado.id);
      
      if (!err1) {
        // Insert movement as 'ajuste'
        await supabase.from('movimentacoes').insert([{
          produto_id: produtoSelecionado.id,
          tipo: 'ajuste',
          quantidade: diff, // Difference can be negative or positive
          data: new Date(dataMov).toISOString()
        }]);
        
        alert("Ajuste registrado com sucesso!");
        setNovoSaldo('');
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
        <h1>Ajuste de Inventário</h1>
      </div>

      <div className="management-grid">
        <div className="glass-panel form-panel">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
            <Settings2 size={20} /> Definir Saldo Final
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
              <label>Novo Saldo</label>
              <input 
                type="number" 
                step="0.01"
                min="0"
                value={novoSaldo} 
                onChange={(e) => setNovoSaldo(e.target.value)}
                placeholder="Saldo atual físico"
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

            <button type="submit" className="btn" style={{ background: 'var(--warning)', color: 'black', width: '100%', marginTop: '1rem', fontWeight: 'bold' }} disabled={loading}>
              <Settings2 size={18} /> Confirmar Ajuste
            </button>
          </form>
        </div>

        <div className="glass-panel table-panel">
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

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Nome do Produto</th>
                  <th>Saldo Atual no Sistema</th>
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

export default Ajustes;
