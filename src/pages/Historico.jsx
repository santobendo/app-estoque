import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLocal } from '../contexts/LocalContext';
import { Search, ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 20;

function TipoBadge({ tipo }) {
  if (tipo === 'entrada') {
    return (
      <span className="badge badge-emerald flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide">
        <ArrowDownCircle size={12} />
        Entrada
      </span>
    );
  }
  return (
    <span className="badge badge-rose flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide">
      <ArrowUpCircle size={12} />
      Saída
    </span>
  );
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Historico() {
  const { localAtual, loadingLocal } = useLocal();
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [pagina, setPagina]     = useState(0);

  /* filtros */
  const [busca, setBusca]       = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim]       = useState('');

  const fetchHistorico = useCallback(async () => {
    if (loadingLocal) return;
    if (!localAtual) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);

    let query = supabase
      .from('vw_auditoria_movimentacoes')
      .select('*', { count: 'exact' })
      .eq('local_id', localAtual.id)
      .order('data', { ascending: false })
      .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1);

    if (filtroTipo)   query = query.eq('tipo', filtroTipo);
    if (filtroInicio) query = query.gte('data', new Date(filtroInicio).toISOString());
    if (filtroFim)    query = query.lte('data', new Date(filtroFim + 'T23:59:59').toISOString());
    if (busca.trim()) {
      // vírgulas/parênteses quebram a sintaxe do .or() do PostgREST
      const termo = busca.replace(/[,()]/g, ' ').trim();
      if (termo) {
        query = query.or(
          `produto.ilike.%${termo}%,usuario.ilike.%${termo}%`
        );
      }
    }

    const { data, count, error } = await query;
    if (!error) {
      setRows(data ?? []);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [pagina, filtroTipo, filtroInicio, filtroFim, busca, localAtual, loadingLocal]);

  useEffect(() => { fetchHistorico(); }, [fetchHistorico]);

  /* resetar página ao mudar filtros ou local */
  useEffect(() => { setPagina(0); }, [filtroTipo, filtroInicio, filtroFim, busca, localAtual]);

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">

      <header>
        <h1 className="text-2xl mb-0.5">Histórico</h1>
        <p className="text-[13px] text-app-text-secondary">
          {localAtual
            ? <>Movimentações registradas em <span className="font-semibold text-app-text">{localAtual.nome}</span>.</>
            : 'Selecione um local na barra superior para ver o histórico.'}
        </p>
      </header>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        {/* Busca */}
        <div className="flex flex-col gap-1 flex-1 min-w-48">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">
            Buscar
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label" size={14} />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Produto ou usuário..."
              className="input-base w-full pl-8 py-2 text-[12px]"
            />
          </div>
        </div>

        {/* Tipo */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">Tipo</label>
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="input-base py-2 text-[12px]"
          >
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </div>

        {/* Data início */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">De</label>
          <input
            type="date"
            value={filtroInicio}
            onChange={e => setFiltroInicio(e.target.value)}
            className="input-base py-2 text-[12px]"
          />
        </div>

        {/* Data fim */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">Até</label>
          <input
            type="date"
            value={filtroFim}
            onChange={e => setFiltroFim(e.target.value)}
            className="input-base py-2 text-[12px]"
          />
        </div>

        {/* Limpar filtros */}
        {(busca || filtroTipo || filtroInicio || filtroFim) && (
          <button
            className="btn btn-secondary text-[12px] py-2 self-end"
            onClick={() => { setBusca(''); setFiltroTipo(''); setFiltroInicio(''); setFiltroFim(''); }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="table-wrapper border-none rounded-none">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Produto</th>
                <th>Apresentação</th>
                <th>Qtd</th>
                <th>Unidade</th>
                <th>Motivo</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-app-text-secondary text-[13px]">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-10 text-app-text-secondary text-[13px]">
                    Nenhuma movimentação encontrada neste local.
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r.id}>
                    <td className="text-[12px] whitespace-nowrap">{formatarData(r.data)}</td>
                    <td><TipoBadge tipo={r.tipo} /></td>
                    <td className="font-semibold">{r.produto}</td>
                    <td className="text-app-text-secondary text-[12px]">{r.apresentacao}</td>
                    <td className="font-bold">{Number(r.quantidade)}</td>
                    <td className="text-[12px] text-app-text-secondary">{r.unidade}</td>
                    <td className="text-[12px]">{r.motivo_descricao ?? '—'}</td>
                    <td className="text-[12px] text-app-text-secondary">{r.usuario}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div className="px-4 py-3 border-t border-app-border-inner flex items-center justify-between">
            <span className="text-[12px] text-app-text-secondary">
              {total} registro{total !== 1 ? 's' : ''} — página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary py-1.5 px-3 text-[12px]"
                disabled={pagina === 0}
                onClick={() => setPagina(p => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="btn btn-secondary py-1.5 px-3 text-[12px]"
                disabled={pagina >= totalPaginas - 1}
                onClick={() => setPagina(p => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
