import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search, Edit2, Trash2, X, Save } from 'lucide-react';

const Produtos = () => {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCategoriaId, setEditCategoriaId] = useState('');

  const fetchCategorias = async () => {
    const { data } = await supabase.from('categorias').select('id, nome').order('nome');
    if (data) setCategorias(data);
  };

  const fetchProdutos = async () => {
    setLoading(true);
    let query = supabase
      .from('produtos')
      .select('id, nome, categoria_id, criado_em, categorias(nome)')
      .order('nome');

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
    fetchCategorias();
  }, []);

  useEffect(() => {
    fetchProdutos();
  }, [busca]);

  const handleDelete = async (id, nomeProduto) => {
    if (!window.confirm(`Excluir '${nomeProduto}' e todas as suas apresentações permanentemente?`)) return;

    const { error } = await supabase.from('produtos').delete().eq('id', id);
    if (error) {
      alert('Erro ao excluir produto: ' + error.message);
    } else {
      fetchProdutos();
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditNome(p.nome);
    setEditCategoriaId(p.categoria_id ? String(p.categoria_id) : '');
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async () => {
    if (!editNome.trim()) return;

    const { error } = await supabase
      .from('produtos')
      .update({
        nome: editNome.toUpperCase(),
        categoria_id: editCategoriaId ? Number(editCategoriaId) : null,
      })
      .eq('id', editingId);

    if (error) {
      alert(error.message.includes('duplicate') ? 'Já existe um produto com esse nome!' : 'Erro ao atualizar: ' + error.message);
    } else {
      setEditingId(null);
      fetchProdutos();
    }
  };

  return (
    <div className="flex flex-col h-full gap-6 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Catálogo de Produtos</h1>
        <p className="text-slate-400">Gerencie os itens do seu estoque. Para novos cadastros, use a aba "Novo Produto".</p>
      </div>

      <div className="glass-panel flex flex-col p-6 gap-6 flex-1 min-h-0">
        <div className="flex justify-start">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="pl-11"
              placeholder="Buscar produtos por nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container flex-1">
          <table className="min-w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="text-center py-8">Carregando...</td>
                </tr>
              ) : produtos.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-8">Nenhum produto encontrado.</td>
                </tr>
              ) : (
                produtos.map((p) => (
                  <tr key={p.id} className="even:bg-white/5">
                    <td className="font-medium">#{p.id}</td>
                    <td className="font-semibold">
                      {editingId === p.id ? (
                        <input
                          type="text"
                          value={editNome}
                          onChange={(e) => setEditNome(e.target.value)}
                          className="w-full bg-slate-950/60 border border-white/10 px-3 py-2 rounded-2xl"
                        />
                      ) : p.nome}
                    </td>
                    <td>
                      {editingId === p.id ? (
                        <select
                          value={editCategoriaId}
                          onChange={(e) => setEditCategoriaId(e.target.value)}
                          className="w-full bg-slate-950/60 border border-white/10 px-3 py-2 rounded-2xl"
                        >
                          <option value="">Sem categoria</option>
                          {categorias.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                      ) : (
                        p.categorias?.nome || <span className="text-slate-500 text-sm italic">Sem categoria</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {editingId === p.id ? (
                          <>
                            <button className="icon-btn text-emerald-300" onClick={handleSaveEdit} title="Salvar">
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
