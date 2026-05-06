import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Printer } from 'lucide-react';
import './RelatorioEstoque.css';

const RelatorioEstoque = () => {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProdutos = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('produtos').select('*').order('nome');
      if (!error && data) {
        setProdutos(data);
      }
      setLoading(false);
    };
    fetchProdutos();
  }, []);

  return (
    <div className="page-container relatorio-container">
      <div className="header-section no-print">
        <h1>Relatório para Contagem Física</h1>
        <p style={{ color: 'var(--text-muted)' }}>Imprima esta planilha para anotar as quantidades reais no estoque.</p>
        <button 
          className="btn btn-primary" 
          onClick={() => window.print()} 
          style={{ marginTop: '1rem', width: 'fit-content' }}
        >
          <Printer size={18} /> Imprimir Planilha
        </button>
      </div>

      {/* Header only visible when printing */}
      <div className="print-only print-header">
        <h2>Planilha de Contagem de Estoque</h2>
        <p>Data da Contagem: ____/____/________   Responsável: ___________________________</p>
      </div>

      <div className="glass-panel printable-panel">
        <div className="table-container printable-table-container">
          <table className="printable-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID</th>
                <th>Nome do Produto</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Unidade</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Saldo Sistema</th>
                <th style={{ width: '200px', textAlign: 'center' }}>Contagem Física</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>Carregando...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan="5" style={{textAlign: 'center', padding: '2rem'}}>Nenhum produto cadastrado.</td></tr>
              ) : (
                produtos.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td style={{ fontWeight: 500 }}>{p.nome}</td>
                    <td style={{ textAlign: 'center' }}>{p.unidade.split(' ')[0]}</td>
                    <td style={{ textAlign: 'right' }}>{Number(p.estoque).toFixed(2)}</td>
                    <td className="empty-cell"></td>
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

export default RelatorioEstoque;
