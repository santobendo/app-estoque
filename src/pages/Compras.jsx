import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ShoppingCart, RefreshCw, Search } from 'lucide-react';

const Compras = () => {
  const [listaCompras, setListaCompras] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  const calcularLista = async () => {
    setLoading(true);

    // Usa a view vw_sugestao_compra que já calcula o consumo dos últimos 30 dias
    const { data, error } = await supabase
      .from('vw_sugestao_compra')
      .select('produto_id, produto, categoria, local_id, local, unidade, consumo_30_dias, estoque_atual, quantidade_sugerida_compra')
      .order('quantidade_sugerida_compra', { ascending: false });

    if (error) {
      console.error('Erro ao buscar sugestão de compras:', error);
    } else {
      setListaCompras(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    calcularLista();
  }, []);

  const listaFiltrada = listaCompras.filter(item =>
    item.produto?.toLowerCase().includes(busca.toLowerCase()) ||
    item.local?.toLowerCase().includes(busca.toLowerCase()) ||
    item.categoria?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Gerador de Lista de Compras</h1>
        <p>Sugestão automática baseada no consumo real dos últimos 30 dias.</p>
      </div>

      <div className="glass-panel flex flex-col p-6 gap-6 h-full min-h-0">

        <div className="compras-controls flex flex-wrap gap-4 items-end">
          <button className="btn btn-primary" onClick={calcularLista} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            Atualizar Lista
          </button>

          <div className="ml-auto search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Filtrar por produto, categoria ou local..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container flex-1 min-h-0">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Local</th>
                <th>Unidade</th>
                <th>Consumo 30 dias</th>
                <th>Estoque Atual</th>
                <th>Qtd. Sugerida</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8">Calculando...</td>
                </tr>
              ) : listaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-slate-400">
                    Nenhum dado disponível. Registre movimentações de saída para gerar sugestões.
                  </td>
                </tr>
              ) : (
                listaFiltrada.map((item, idx) => (
                  <tr
                    key={`${item.produto_id}-${item.local_id}-${idx}`}
                    className={Number(item.quantidade_sugerida_compra) > 0 ? 'bg-blue-500/5' : ''}
                  >
                    <td className="font-medium">{item.produto}</td>
                    <td className="text-sm text-slate-400">{item.categoria || '—'}</td>
                    <td className="text-sm">{item.local}</td>
                    <td className="text-sm text-slate-400">{item.unidade}</td>
                    <td>{Number(item.consumo_30_dias).toFixed(4)}</td>
                    <td>{Number(item.estoque_atual).toFixed(4)}</td>
                    <td>
                      {Number(item.quantidade_sugerida_compra) > 0 ? (
                        <span className="badge badge-warning inline-flex gap-1 text-xs">
                          <ShoppingCart size={14} />
                          {Number(item.quantidade_sugerida_compra).toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-slate-500">OK</span>
                      )}
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

export default Compras;
