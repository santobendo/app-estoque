import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Printer } from 'lucide-react';

const RelatorioEstoque = () => {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItens = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('estoques')
        .select(`
          id,
          quantidade_atual,
          apresentacoes (
            id,
            descricao,
            quantidade_unitaria,
            unidades ( sigla ),
            produtos (
              id,
              nome,
              categorias ( nome )
            )
          ),
          locais ( id, nome )
        `)
        .order('id');

      if (!error && data) {
        // Ordenar por nome do produto depois local
        const sorted = [...data].sort((a, b) => {
          const nomeA = a.apresentacoes?.produtos?.nome || '';
          const nomeB = b.apresentacoes?.produtos?.nome || '';
          return nomeA.localeCompare(nomeB, 'pt-BR');
        });
        setItens(sorted);
      }
      setLoading(false);
    };
    fetchItens();
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

      {/* Cabeçalho visível apenas na impressão */}
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
                <th>Produto</th>
                <th>Apresentação</th>
                <th>Categoria</th>
                <th>Local</th>
                <th className="w-24 text-center">Unidade</th>
                <th className="w-32 text-right">Saldo Sistema</th>
                <th className="w-48 text-center">Contagem Física</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="text-center py-8">Carregando...</td></tr>
              ) : itens.length === 0 ? (
                <tr><td colSpan="8" className="text-center py-8">Nenhum item cadastrado.</td></tr>
              ) : (
                itens.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td className="font-medium">{item.apresentacoes?.produtos?.nome || '—'}</td>
                    <td>{item.apresentacoes?.descricao || '—'}</td>
                    <td className="text-slate-400 text-sm">{item.apresentacoes?.produtos?.categorias?.nome || '—'}</td>
                    <td>{item.locais?.nome || '—'}</td>
                    <td className="text-center">{item.apresentacoes?.unidades?.sigla || '—'}</td>
                    <td className="text-right">{Number(item.quantidade_atual).toFixed(4)}</td>
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
