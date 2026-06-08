import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Printer } from 'lucide-react';

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
    <div className="page-container relatorio-container animate-fade-in">
      <div className="header-section no-print">
        <h1>Relatório para Contagem Física</h1>
        <p>Imprima esta planilha para anotar as quantidades reais no estoque.</p>
        <button 
          className="btn btn-primary mt-4 w-fit" 
          onClick={() => window.print()} 
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
                <th className="w-20">ID</th>
                <th>Nome do Produto</th>
                <th className="w-24 text-center">Unidade</th>
                <th className="w-32 text-right">Saldo Sistema</th>
                <th className="w-48 text-center">Contagem Física</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center py-8">Carregando...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-8">Nenhum produto cadastrado.</td></tr>
              ) : (
                produtos.map((p) => (
                  <tr key={p.id}>
                    <td>#{p.id}</td>
                    <td className="font-medium">{p.nome}</td>
                    <td className="text-center">{p.unidade.split(' ')[0]}</td>
                    <td className="text-right">{Number(p.estoque).toFixed(2)}</td>
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
