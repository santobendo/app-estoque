import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Shield, ShieldOff, UserCheck, UserX } from 'lucide-react';
import TabelaCrud, { ConfirmDialog } from '../components/TabelaCrud';

/* ─── Aba Usuários ─── */
function AbaUsuarios({ papeis }) {
  const { user: currentUser } = useAuth();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmacao, setConfirmacao] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('perfis')
      .select('id, nome, is_admin, ativo, papel_id, papeis(nome)')
      .order('nome');
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const toggleAtivo = (row) => {
    if (row.id === currentUser?.id) return;
    const novoValor = !row.ativo;
    setConfirmacao({
      mensagem: `Deseja realmente ${novoValor ? 'ativar' : 'desativar'} o usuário "${row.nome}"? ${!novoValor ? 'Ele perderá acesso ao sistema.' : ''}`,
      onConfirm: async () => {
        await supabase.from('perfis').update({ ativo: novoValor }).eq('id', row.id);
        setConfirmacao(null);
        fetch();
      }
    });
  };

  const toggleAdmin = (row) => {
    if (row.id === currentUser?.id) return;
    const novoValor = !row.is_admin;
    setConfirmacao({
      mensagem: `Deseja realmente ${novoValor ? 'conceder' : 'remover'} privilégios de administrador para "${row.nome}"?`,
      onConfirm: async () => {
        await supabase.from('perfis').update({ is_admin: novoValor }).eq('id', row.id);
        setConfirmacao(null);
        fetch();
      }
    });
  };

  const alterarPapel = async (id, papelId) => {
    await supabase.from('perfis').update({ papel_id: papelId ? Number(papelId) : null }).eq('id', id);
    fetch();
  };

  return (
    <div className="table-wrapper">
      {confirmacao && (
        <ConfirmDialog
          mensagem={confirmacao.mensagem}
          onConfirm={confirmacao.onConfirm}
          onCancel={() => setConfirmacao(null)}
        />
      )}
      <table className="table-clean">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Admin</th>
            <th>Papel</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="4" className="text-center py-8 text-app-text-secondary text-[13px]">Carregando...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan="4" className="text-center py-8 text-app-text-secondary text-[13px]">Nenhum usuário cadastrado.</td></tr>
          ) : rows.map(row => {
            const isMe = row.id === currentUser?.id;
            return (
              <tr key={row.id} className={`${isMe ? 'bg-app-bg' : ''} ${!row.ativo ? 'opacity-60 bg-gray-50/35' : ''}`}>
                <td>
                  <div>
                    <p className="font-semibold text-[13px]">{row.nome}</p>
                    {isMe && <p className="text-[10px] text-app-text-label uppercase tracking-wide">você</p>}
                  </div>
                </td>
                <td>
                  <button
                    disabled={isMe}
                    onClick={() => toggleAdmin(row)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all ${
                      row.is_admin ? 'badge badge-violet' : 'bg-app-bg text-app-text-label'
                    } ${isMe ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {row.is_admin ? <><Shield size={11} /> Admin</> : <><ShieldOff size={11} /> Padrão</>}
                  </button>
                </td>
                <td>
                  <select
                    value={row.papel_id ?? ''}
                    onChange={e => alterarPapel(row.id, e.target.value)}
                    disabled={isMe || !row.ativo}
                    className="input-base py-1.5 text-[12px] disabled:opacity-50"
                  >
                    <option value="">Sem papel</option>
                    {papeis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </td>
                <td>
                  <button
                    disabled={isMe}
                    onClick={() => toggleAtivo(row)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all ${
                      row.ativo ? 'badge badge-emerald' : 'badge badge-rose'
                    } ${isMe ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {row.ativo ? <><UserCheck size={11} /> Ativo</> : <><UserX size={11} /> Inativo</>}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Página principal
   Obs: Categorias, Unidades e Locais migraram
   para o menu Cadastros (/cadastros).
═══════════════════════════════════════════ */
const ABAS = ['Usuários', 'Papéis'];

export default function Configuracoes() {
  const { isAdmin } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState('Usuários');
  const [papeis, setPapeis]     = useState([]);

  useEffect(() => {
    supabase.from('papeis').select('id, nome').order('nome')
      .then(({ data }) => setPapeis(data ?? []));
  }, []);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-app-text-secondary">
        <Shield size={32} className="text-app-text-label" />
        <p className="text-[14px] font-semibold">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl mb-0.5">Configurações</h1>
        <p className="text-[13px] text-app-text-secondary">Gerencie usuários e papéis do sistema.</p>
      </header>

      {/* Abas */}
      <div className="flex gap-1 border-b border-app-border">
        {ABAS.map(aba => (
          <button
            key={aba}
            onClick={() => setAbaAtiva(aba)}
            className={`px-4 py-2.5 text-[13px] font-semibold transition-all border-b-2 -mb-px ${
              abaAtiva === aba
                ? 'border-app-text text-app-text'
                : 'border-transparent text-app-text-secondary hover:text-app-text'
            }`}
          >
            {aba}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {abaAtiva === 'Usuários' && <AbaUsuarios papeis={papeis} />}
      {abaAtiva === 'Papéis' && (
        <TabelaCrud
          tabela="papeis"
          colunas={[
            { field: 'nome', label: 'Nome' },
            { field: 'descricao', label: 'Descrição', placeholder: 'Descrição (opcional)' },
          ]}
          labelNovo="Novo Papel"
        />
      )}
    </div>
  );
}
