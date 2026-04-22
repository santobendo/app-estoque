import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Plus, Edit2, ArrowRightLeft, Trash2 } from 'lucide-react';
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

  // Form states
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState(UNIDADES[0]);

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

  const handleCadastrar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;

    const { error } = await supabase.from('produtos').insert([
      { nome: nome.toUpperCase(), unidade, estoque: 0 }
    ]);

    if (error) {
      alert(error.message.includes('duplicate key') ? 'Produto já existe!' : 'Erro ao cadastrar.');
    } else {
      setNome('');
      fetchProdutos();
    }
  };

  const handleDelete = async (id, nomeProduto) => {
    if (!window.confirm(`Excluir '${nomeProduto}' e todo seu histórico permanentemente?`)) return;
    
    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) {
      alert('Erro ao excluir produto.');
    } else {
      fetchProdutos();
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Gestão de Produtos</h1>
      </div>

      <div className="management-grid">
        {/* Formulário de Cadastro */}
        <div className="glass-panel form-panel">
          <h2>Cadastro Rápido</h2>
          <form onSubmit={handleCadastrar}>
            <div className="input-group">
              <label>Nome do Produto</label>
              <input 
                type="text" 
                value={nome} 
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: COPO DESCARTÁVEL..."
                required
              />
            </div>
            
            <div className="input-group">
              <label>Unidade de Medida</label>
              <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
              <Plus size={18} /> Cadastrar Produto
            </button>
          </form>
        </div>

        {/* Tabela */}
        <div className="glass-panel table-panel">
          <div className="table-header-actions">
            <div className="search-box">
              <Search size={18} className="search-icon" />
              <input 
                type="text" 
                placeholder="Buscar produtos..." 
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Unidade</th>
                  <th>Saldo</th>
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
                      <td style={{fontWeight: 500}}>{p.nome}</td>
                      <td>{p.unidade}</td>
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
                          <button className="icon-btn danger" onClick={() => handleDelete(p.id, p.nome)} title="Excluir">
                            <Trash2 size={16} />
                          </button>
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
    </div>
  );
};

export default Produtos;
