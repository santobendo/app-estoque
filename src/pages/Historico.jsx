import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Search } from 'lucide-react';

const Historico = () => {
  const [historico, setHistorico] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchHistorico = async () => {
    setLoading(true);

    // Usa a view vw_auditoria_movimentacoes que já faz todos os joins necessários
    const { data, error } = await supabase
      .from('vw_auditoria_movimentacoes')
      .select('id, data, tipo, quantidade, quantidade_unitaria, unidade, motivo, motivo_descricao, produto, apresentacao, local, usuario, cargo_usuario')
      .order('data', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Erro ao buscar histórico:', error);
      setHistorico([]);
    } else {
      setHistorico(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistorico();
  }, []);

  const historicoFiltrado = historico.filter(h => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      (h.produto || '').toLowerCase().includes(termo) ||
      (h.local || '').toLowerCase().includes(termo) ||
      (h.usuario || '').toLowerCase().includes(termo) ||
      (h.motivo || '').toLowerCase().includes(termo)
    );
  });

  const getBadgeType = (tipo) => {
    if (tipo === 'entrada') return 'badge-success';
    if (tipo === 'saida') return 'badge-danger';
    return 'badge-warning';
  };

  const getIcon = (tipo) => {
    if (tipo === 'entrada') return '🟢 Entrada';
    if (tipo === 'saida') return '🔴 Saída';
    return '⚙️ Ajuste';
  };

  const getMotivoLabel = (motivo, descricao) => {
    if (!motivo) return <span className="text-slate-500 italic text-xs">—</span>;
    return (
      <span title={descricao} className="text-xs bg-white/5 px-2 py-0.5 rounded capitalize">
        {motivo}
      </span>
    );
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="header-section">
        <h1>Histórico de Movimentações</h1>
        <p>Acompanhe e audite todas as transações de estoque.</p>
      </div>

      <div className="glass-panel flex flex-col p-6 gap-4 h-full min-h-0">

        <div className="table-header-actions justify-start">
          <div className="search-box w-96">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por produto, local, usuário ou motivo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container flex-1 min-h-0">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Data / Hora</th>
                <th>Produto</th>
                <th>Apresentação</th>
                <th>Local</th>
                <th>Tipo</th>
                <th>Quantidade</th>
                <th>Unidade</th>
                <th>Motivo</th>
                <th>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" className="text-center py-8">Carregando...</td></tr>
              ) : historicoFiltrado.length === 0 ? (
                <tr><td colSpan="10" className="text-center py-8">Nenhuma movimentação encontrada.</td></tr>
              ) : (
                historicoFiltrado.map((h) => {
                  const dataObj = new Date(h.data);
                  const dataStr = dataObj.toLocaleDateString('pt-BR') + ' ' + dataObj.toLocaleTimeString('pt-BR');

                  return (
                    <tr key={h.id}>
                      <td className="text-slate-500">#{h.id}</td>
                      <td className="text-sm">{dataStr}</td>
                      <td className="font-medium">{h.produto || '—'}</td>
                      <td className="text-sm text-slate-400">{h.apresentacao || '—'}</td>
                      <td className="text-sm">{h.local || '—'}</td>
                      <td>
                        <span className={`badge ${getBadgeType(h.tipo)}`}>
                          {getIcon(h.tipo)}
                        </span>
                      </td>
                      <td className="font-semibold">{Number(h.quantidade).toFixed(4)}</td>
                      <td className="text-sm text-slate-400">{h.unidade || '—'}</td>
                      <td>{getMotivoLabel(h.motivo, h.motivo_descricao)}</td>
                      <td className="text-sm">{h.usuario || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Historico;
