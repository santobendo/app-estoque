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
      
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Novo Produto</h1>
        <p>Cadastre um novo item no catálogo de estoque.</p>
      </div>

      <div className="mx-auto w-full max-w-2xl">
        <div className="glass-panel p-8">
          {success && (
            <div className="mb-6 flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-emerald-300">
              <CheckCircle size={20} />
              Produto cadastrado com sucesso!
            </div>
          )}

          <form onSubmit={handleCadastrar} className="flex flex-col gap-6">
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
              <select 
                value={unidade} 
                onChange={(e) => setUnidade(e.target.value)}
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div className="flex gap-4 pt-2">
              <button 
                type="button" 
                className="btn btn-danger flex-1 py-3" 
                onClick={() => navigate('/')}
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="btn btn-primary flex-[2] py-3 text-base" 
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
