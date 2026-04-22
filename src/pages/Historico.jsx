import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Trash2 } from 'lucide-react';

const Historico = () => {
  const [historico, setHistorico] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchHistorico = async () => {
    setLoading(true);
    let query = supabase
      .from('movimentacoes')
      .select('id, data, tipo, quantidade, produto_id, produtos(nome)')
      .order('data', { ascending: false });

    // Since Supabase JS currently doesn't support ilike on related tables easily in a single query
    // we'll fetch and filter client-side for simplicity on small datasets,
    // or we can just fetch all and filter in JS if search is used.
    
    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar historico:', error);
      setHistorico([]);
    } else {
      setHistorico(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistorico();
  }, []);

  const handleExcluir = async (movId, produtoId, tipo, quantidade) => {
    if (!window.confirm(`Excluir esta movimentação? O estoque será revertido.`)) return;

    // Fetch current product stock
    const { data: pData } = await supabase.from('produtos').select('estoque').eq('id', produtoId).single();
    
    if (pData) {
      let estoqueAtual = Number(pData.estoque);
      let qtdMov = Number(quantidade);
      let novoEstoque = estoqueAtual;

      if (tipo === 'entrada') novoEstoque -= qtdMov;
      else if (tipo === 'saida') novoEstoque += qtdMov;
      else if (tipo === 'ajuste') novoEstoque -= qtdMov;

      // Update stock
      await supabase.from('produtos').update({ estoque: novoEstoque }).eq('id', produtoId);
      
      // Delete movement
      await supabase.from('movimentacoes').delete().eq('id', movId);
      
      fetchHistorico();
    }
  };

  // Client-side filtering
  const historicoFiltrado = historico.filter(h => {
    if (!busca) return true;
    const nome = h.produtos?.nome || '';
    return nome.toLowerCase().includes(busca.toLowerCase());
  });

  const getBadgeType = (tipo) => {
    if (tipo === 'entrada') return 'badge-success';
    if (tipo === 'saida') return 'badge-danger';
    return 'badge-warning';
  };

  const getIcon = (tipo) => {
    if (tipo === 'entrada') return '🟢 Entrada';
    if (tipo === 'saida') return '🔴 Saída';
    return '⚙️ Ajuste';
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Histórico de Movimentações</h1>
        <p style={{ color: 'var(--text-muted)' }}>Acompanhe e audite todas as transações de estoque.</p>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
        
        <div className="table-header-actions" style={{ justifyContent: 'flex-start' }}>
          <div className="search-box" style={{ width: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por nome do produto..." 
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container" style={{ flex: 1 }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Data / Hora</th>
                <th>Produto</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{textAlign: 'center'}}>Carregando...</td></tr>
              ) : historicoFiltrado.length === 0 ? (
                <tr><td colSpan="6" style={{textAlign: 'center'}}>Nenhuma movimentação encontrada.</td></tr>
              ) : (
                historicoFiltrado.map((h) => {
                  const dataObj = new Date(h.data);
                  const dataStr = dataObj.toLocaleDateString('pt-BR') + ' ' + dataObj.toLocaleTimeString('pt-BR');
                  
                  return (
                    <tr key={h.id}>
                      <td style={{ color: 'var(--text-muted)' }}>#{h.id}</td>
                      <td>{dataStr}</td>
                      <td style={{fontWeight: 500}}>{h.produtos?.nome || 'Desconhecido'}</td>
                      <td>
                        <span className={`badge ${getBadgeType(h.tipo)}`}>
                          {getIcon(h.tipo)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{Number(h.quantidade).toFixed(2)}</td>
                      <td>
                        <button 
                          className="icon-btn danger" 
                          onClick={() => handleExcluir(h.id, h.produto_id, h.tipo, h.quantidade)}
                          title="Excluir Movimentação"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default Historico;
