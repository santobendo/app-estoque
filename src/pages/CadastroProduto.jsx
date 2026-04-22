import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const UNIDADES = [
  "Un (unidades)", "Kg (quilos)", "Gr (gramas)", "Mt (metros)",
  "Cm (centímetros)", "Lt (litros)", "Ml (mililitros)", "Cx (caixa)",
  "Pc (pacote)", "Dz (dúzia)", "Pl (palete)", "Pr (par)"
];

const CadastroProduto = () => {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState(UNIDADES[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleCadastrar = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;

    setLoading(true);
    setSuccess(false);

    const { error } = await supabase.from('produtos').insert([
      { nome: nome.toUpperCase(), unidade, estoque: 0 }
    ]);

    setLoading(false);

    if (error) {
      alert(error.message.includes('duplicate key') ? 'Produto já existe com esse nome!' : 'Erro ao cadastrar: ' + error.message);
    } else {
      setSuccess(true);
      setNome('');
      setUnidade(UNIDADES[0]);
      
      // Auto dismiss success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Novo Produto</h1>
        <p style={{ color: 'var(--text-muted)' }}>Cadastre um novo item no catálogo de estoque.</p>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <div className="glass-panel" style={{ padding: '2rem' }}>
          {success && (
            <div style={{ 
              backgroundColor: 'rgba(16, 185, 129, 0.1)', 
              color: 'var(--success)', 
              padding: '1rem', 
              borderRadius: '8px', 
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <CheckCircle size={20} />
              Produto cadastrado com sucesso!
            </div>
          )}

          <form onSubmit={handleCadastrar} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="input-group">
              <label>Nome do Produto</label>
              <input 
                type="text" 
                value={nome} 
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: COPO DESCARTÁVEL..."
                style={{ fontSize: '1.1rem', padding: '1rem' }}
                required
              />
            </div>
            
            <div className="input-group">
              <label>Unidade de Medida</label>
              <select 
                value={unidade} 
                onChange={(e) => setUnidade(e.target.value)}
                style={{ fontSize: '1.1rem', padding: '1rem' }}
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button 
                type="button" 
                className="btn btn-danger" 
                style={{ flex: 1, padding: '1rem' }}
                onClick={() => navigate('/')}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ flex: 2, padding: '1rem', fontSize: '1.1rem' }}
                disabled={loading}
              >
                {loading ? 'Salvando...' : <><Plus size={20} /> Cadastrar Produto</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CadastroProduto;
