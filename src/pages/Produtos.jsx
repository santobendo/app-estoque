import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Edit2, Trash2, X, Save } from 'lucide-react';
import './Produtos.css';

const UNIDADES = [
  "Un (unidades)", "Kg (quilos)", "Gr (gramas)", "Mt (metros)",
  "Cm (centímetros)", "Lt (litros)", "Ml (mililitros)", "Cx (caixa)",
  "Pc (pacote)", "Dz (dúzia)", "Pl (palete)", "Pr (par)"
];

const Produtos = () => {
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editingId, setEditingId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editUnidade, setEditUnidade] = useState('');

  const fetchProdutos = async () => {
    setLoading(true);
    let query = supabase.from('produtos').select('*').order('nome');
    
    if (busca) {
      query = query.ilike('nome', `%${busca}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Erro ao buscar produtos:', error);
    } else {
      setProdutos(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProdutos();
  }, [busca]);

  const handleDelete = async (id, nomeProduto) => {
    if (!window.confirm(`Excluir '${nomeProduto}' e todo seu histórico permanentemente?`)) return;
    
    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) {
      alert('Erro ao excluir produto.');
    } else {
      fetchProdutos();
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditNome(p.nome);
    setEditUnidade(p.unidade);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editNome.trim()) return;

    const { error } = await supabase
      .from('produtos')
      .update({ nome: editNome.toUpperCase(), unidade: editUnidade })
      .eq('id', editingId);

    if (error) {
      alert(error.message.includes('duplicate key') ? 'Já existe um produto com esse nome!' : 'Erro ao atualizar.');
    } else {
      setEditingId(null);
      fetchProdutos();
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Catálogo de Produtos</h1>
        <p style={{ color: 'var(--text-muted)' }}>Gerencie os itens do seu estoque. Para novos cadastros, use a aba "Novo Produto".</p>
      </div>

      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem', flex: 1, minHeight: 0 }}>
        <div className="table-header-actions" style={{ justifyContent: 'flex-start' }}>
          <div className="search-box" style={{ width: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar produtos por nome..." 
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
                <th>Nome</th>
                <th>Unidade</th>
                <th>Saldo Atual</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{textAlign: 'center'}}>Carregando...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan="6" style={{textAlign: 'center'}}>Nenhum produto encontrado.</td></tr>
              ) : (
                produtos.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    
                    {/* NOME COLUMN */}
                    <td style={{fontWeight: 500}}>
                      {editingId === p.id ? (
                        <input 
                          type="text" 
                          value={editNome} 
                          onChange={(e) => setEditNome(e.target.value)}
                          style={{ padding: '0.4rem', width: '100%' }}
                        />
                      ) : p.nome}
                    </td>

                    {/* UNIDADE COLUMN */}
                    <td>
                      {editingId === p.id ? (
                        <select 
                          value={editUnidade} 
                          onChange={(e) => setEditUnidade(e.target.value)}
                          style={{ padding: '0.4rem' }}
                        >
                          {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      ) : p.unidade}
                    </td>

                    <td>{Number(p.estoque).toFixed(2)}</td>
                    
                    <td>
                      {p.estoque <= 5 ? (
                        <span className="badge badge-danger">⚠️ BAIXO</span>
                      ) : (
                        <span className="badge badge-success">✅ OK</span>
                      )}
                    </td>
                    
                    <td>
                      <div className="action-buttons">
                        {editingId === p.id ? (
                          <>
                            <button className="icon-btn" style={{ color: 'var(--success)' }} onClick={handleSaveEdit} title="Salvar">
                              <Save size={18} />
                            </button>
                            <button className="icon-btn danger" onClick={cancelEdit} title="Cancelar">
                              <X size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="icon-btn" onClick={() => startEdit(p)} title="Editar">
                              <Edit2 size={16} />
                            </button>
                            <button className="icon-btn danger" onClick={() => handleDelete(p.id, p.nome)} title="Excluir">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Produtos;
