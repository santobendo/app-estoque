import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ShoppingCart, RefreshCw, Search } from 'lucide-react';
import './Compras.css';

const Compras = () => {
  const [diasHistorico, setDiasHistorico] = useState(30);
  const [listaCompras, setListaCompras] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  const calcularLista = async () => {
    setLoading(true);
    
    // 1. Fetch all products
    const { data: produtosData } = await supabase.from('produtos').select('id, nome, unidade, estoque');
    
    // 2. Fetch movements (saidas) in the date range
    const d = new Date();
    d.setDate(d.getDate() - diasHistorico);
    const dateLimit = d.toISOString();

    const { data: movsData } = await supabase
      .from('movimentacoes')
      .select('produto_id, quantidade')
      .eq('tipo', 'saida')
      .gte('data', dateLimit);

    if (produtosData && movsData) {
      // Calculate total outputs per product
      const totalSaidaPorProduto = {};
      movsData.forEach(m => {
        totalSaidaPorProduto[m.produto_id] = (totalSaidaPorProduto[m.produto_id] || 0) + Number(m.quantidade);
      });

      const lista = produtosData.map(p => {
        const totalSaida = totalSaidaPorProduto[p.id] || 0;
        const consumoDiario = diasHistorico > 0 ? totalSaida / diasHistorico : 0;
        const consumo30Dias = consumoDiario * 30;
        const metaEstoqueMensal = consumo30Dias * 1.10; // 10% safety margin
        
        let qtdComprar = metaEstoqueMensal - p.estoque;
        if (qtdComprar < 0) qtdComprar = 0;

        const durabilidade = consumoDiario > 0 ? p.estoque / consumoDiario : Infinity;

        return {
          ...p,
          consumo30Dias,
          sugestaoCompra: qtdComprar,
          durabilidadeDias: durabilidade
        };
      });

      // Sort by need (highest to buy first)
      lista.sort((a, b) => b.sugestaoCompra - a.sugestaoCompra);
      setListaCompras(lista);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    calcularLista();
  }, []); // Run once on mount

  const listaFiltrada = listaCompras.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Gerador de Lista de Compras</h1>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
        
        <div className="compras-controls" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label>Dias de Histórico Analisados</label>
            <input 
              type="number" 
              value={diasHistorico} 
              onChange={(e) => setDiasHistorico(Number(e.target.value))}
              min="1"
              style={{ width: '150px' }}
            />
          </div>
          
          <button className="btn btn-primary" onClick={calcularLista} disabled={loading}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
            Calcular Sugestão
          </button>

          <div style={{ marginLeft: 'auto' }} className="search-box">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Filtrar itens..." 
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container" style={{ flex: 1 }}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Unidade</th>
                <th>Estoque Atual</th>
                <th>Gasto/Mês Estimado</th>
                <th>Dias Restantes</th>
                <th>QTD Comprar</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((item) => (
                <tr key={item.id} style={{ background: item.sugestaoCompra > 0 ? 'rgba(59, 130, 246, 0.05)' : '' }}>
                  <td style={{fontWeight: 500}}>{item.nome}</td>
                  <td>{item.unidade.split(' ')[0]}</td>
                  <td>{Number(item.estoque).toFixed(2)}</td>
                  <td>{item.consumo30Dias.toFixed(2)}</td>
                  <td>{item.durabilidadeDias === Infinity ? 'Infinito' : `${item.durabilidadeDias.toFixed(0)} dias`}</td>
                  <td>
                    {item.sugestaoCompra > 0 ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.85rem' }}>
                        <ShoppingCart size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }}/>
                        {Number(item.sugestaoCompra.toFixed(2)).toString()}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default Compras;
