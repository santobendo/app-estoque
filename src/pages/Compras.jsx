import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ShoppingCart, TrendingUp, Package, AlertCircle } from 'lucide-react';

function StatCard({ label, value, sub, color = 'text-app-text' }) {
  return (
    <div className="card p-5 flex flex-col gap-1.5">
      <span className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-[11px] text-app-text-secondary">{sub}</span>}
    </div>
  );
}

export default function Compras() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState('');

  useEffect(() => {
    supabase
      .from('vw_sugestao_compra')
      .select('*')
      .order('quantidade_sugerida_compra', { ascending: false })
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, []);

  const filtrados = rows.filter(r => {
    if (!busca.trim()) return true;
    const t = busca.toLowerCase();
    return (
      r.produto?.toLowerCase().includes(t) ||
      r.categoria?.toLowerCase().includes(t) ||
      r.local?.toLowerCase().includes(t)
    );
  });

  const totalItensComprar = rows.filter(r => Number(r.quantidade_sugerida_compra) > 0).length;
  const totalSemEstoque   = rows.filter(r => Number(r.estoque_atual) <= 0).length;

  const getRowStyle = (row) => {
    const sugestao = Number(row.quantidade_sugerida_compra);
    const estoque  = Number(row.estoque_atual);
    if (estoque <= 0)   return 'bg-rose-50';
    if (sugestao > 0)   return 'bg-amber-50/50';
    return '';
  };

  return (
    <div className="flex flex-col gap-5">

      <header>
        <h1 className="text-2xl mb-0.5">Sugestão de Compra</h1>
        <p className="text-[13px] text-app-text-secondary">
          Baseado no consumo dos últimos 30 dias versus o estoque atual.
        </p>
      </header>

      {/* Cards de resumo */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Itens a comprar"
          value={loading ? '—' : totalItensComprar}
          sub="com sugestão > 0"
          color="text-amber-600"
        />
        <StatCard
          label="Sem estoque"
          value={loading ? '—' : totalSemEstoque}
          sub="estoque zerado ou negativo"
          color="text-rose-600"
        />
        <StatCard
          label="Total de itens"
          value={loading ? '—' : rows.length}
          sub="produtos × locais monitorados"
        />
      </div>

      {/* Filtro */}
      <div className="card p-4">
        <div className="relative max-w-sm">
          <ShoppingCart className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label" size={14} />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar por produto, categoria ou local..."
            className="input-base w-full pl-9 py-2 text-[12px]"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="table-wrapper border-none rounded-none">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Local</th>
                <th>Unidade</th>
                <th className="text-right">Consumo 30d</th>
                <th className="text-right">Estoque Atual</th>
                <th className="text-right">Sugestão de Compra</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-app-text-secondary text-[13px]">
                    Carregando...
                  </td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-10 text-app-text-secondary text-[13px]">
                    Nenhum item encontrado.
                  </td>
                </tr>
              ) : (
                filtrados.map((r, i) => {
                  const sugestao = Number(r.quantidade_sugerida_compra);
                  const estoque  = Number(r.estoque_atual);
                  return (
                    <tr key={i} className={getRowStyle(r)}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-app-bg flex items-center justify-center text-app-text-label shrink-0">
                            <Package size={14} />
                          </div>
                          <span className="font-semibold">{r.produto}</span>
                        </div>
                      </td>
                      <td>
                        <span className="text-[12px] text-app-text-secondary">{r.categoria ?? '—'}</span>
                      </td>
                      <td className="text-[12px]">{r.local}</td>
                      <td className="text-[12px] text-app-text-secondary">{r.unidade}</td>
                      <td className="text-right">
                        <span className="flex items-center justify-end gap-1 text-[13px]">
                          <TrendingUp size={12} className="text-app-text-label" />
                          {Number(r.consumo_30_dias).toFixed(2)}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className={`font-bold text-[13px] ${estoque <= 0 ? 'text-rose-600' : 'text-app-text'}`}>
                          {estoque.toFixed(2)}
                        </span>
                      </td>
                      <td className="text-right">
                        {sugestao > 0 ? (
                          <span className="inline-flex items-center gap-1.5 badge badge-amber px-2.5 py-1 rounded-md text-[12px] font-bold">
                            <AlertCircle size={12} />
                            {sugestao.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-semibold text-[12px]">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-app-text-label text-center">
        Sugestão = consumo médio dos últimos 30 dias − estoque atual. Descartes são excluídos do cálculo.
      </p>
    </div>
  );
}
