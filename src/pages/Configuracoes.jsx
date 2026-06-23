import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Pencil, Trash2, Check, X, Shield, ShieldOff, UserCheck, UserX } from 'lucide-react';

/* ─── helpers ─── */
function Label({ children }) {
  return <label className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">{children}</label>;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-app-text-label" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ConfirmDialog({ mensagem, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-sm">
        <p className="text-[14px] font-semibold text-app-text mb-5">{mensagem}</p>
        <div className="flex gap-3 justify-end">
          <button className="btn btn-secondary px-4 py-2" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-danger px-4 py-2" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

/* ─── CRUD genérico para tabelas simples ─── */
function TabelaSimples({ tabela, colunas, labelNovo }) {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editando, setEditando] = useState(null); // { id, ...campos } ou null
  const [novo, setNovo]         = useState(null);  // { ...campos } ou null
  const [deletando, setDeletando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from(tabela).select('*').order(colunas[0].field);
    setRows(data ?? []);
    setLoading(false);
  }, [tabela]);

  useEffect(() => { fetch(); }, [fetch]);

  const salvarNovo = async () => {
    if (!novo) return;
    setSalvando(true);
    await supabase.from(tabela).insert([novo]);
    setNovo(null);
    setSalvando(false);
    fetch();
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    const { id, ...campos } = editando;
    setSalvando(true);
    await supabase.from(tabela).update(campos).eq('id', id);
    setEditando(null);
    setSalvando(false);
    fetch();
  };

  const confirmarDelete = async () => {
    await supabase.from(tabela).delete().eq('id', deletando);
    setDeletando(null);
    fetch();
  };

  const emptyNovo = () => Object.fromEntries(colunas.map(c => [c.field, '']));

  return (
    <div className="flex flex-col gap-3">
      {deletando && (
        <ConfirmDialog
          mensagem="Confirmar exclusão? Esta ação não pode ser desfeita."
          onConfirm={confirmarDelete}
          onCancel={() => setDeletando(null)}
        />
      )}

      <div className="flex justify-end">
        <button
          className="btn btn-primary flex items-center gap-1.5 text-[12px] px-4 py-2"
          onClick={() => { setNovo(emptyNovo()); setEditando(null); }}
          disabled={!!novo}
        >
          <Plus size={13} /> {labelNovo}
        </button>
      </div>

      <div className="table-wrapper">
        <table className="table-clean">
          <thead>
            <tr>
              {colunas.map(c => <th key={c.field}>{c.label}</th>)}
              <th className="text-right w-24">Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* Linha de novo */}
            {novo && (
              <tr className="bg-app-bg">
                {colunas.map(c => (
                  <td key={c.field}>
                    <input
                      type="text"
                      value={novo[c.field]}
                      onChange={e => setNovo(p => ({ ...p, [c.field]: e.target.value }))}
                      placeholder={c.label}
                      className="input-base py-1.5 text-[12px] w-full"
                    />
                  </td>
                ))}
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={salvarNovo} disabled={salvando} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors">
                      {salvando ? <Spinner /> : <Check size={15} />}
                    </button>
                    <button onClick={() => setNovo(null)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors">
                      <X size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {loading ? (
              <tr><td colSpan={colunas.length + 1} className="text-center py-8 text-app-text-secondary text-[13px]">Carregando...</td></tr>
            ) : rows.length === 0 && !novo ? (
              <tr><td colSpan={colunas.length + 1} className="text-center py-8 text-app-text-secondary text-[13px]">Nenhum registro.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id}>
                {colunas.map(c => (
                  <td key={c.field}>
                    {editando?.id === row.id ? (
                      <input
                        type="text"
                        value={editando[c.field] ?? ''}
                        onChange={e => setEditando(p => ({ ...p, [c.field]: e.target.value }))}
                        className="input-base py-1.5 text-[12px] w-full"
                      />
                    ) : (
                      <span className={c.field === colunas[0].field ? 'font-semibold' : 'text-app-text-secondary text-[12px]'}>
                        {row[c.field] ?? '—'}
                      </span>
                    )}
                  </td>
                ))}
                <td className="text-right">
                  {editando?.id === row.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={salvarEdicao} disabled={salvando} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors">
                        {salvando ? <Spinner /> : <Check size={15} />}
                      </button>
                      <button onClick={() => setEditando(null)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500 transition-colors">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditando({ ...row })}
                        className="p-1.5 rounded-lg hover:bg-app-bg text-app-text-label hover:text-app-text transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeletando(row.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-app-text-label hover:text-rose-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Aba Locais (tem campo 'ativo') ─── */
function AbaLocais() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo]       = useState(null);
  const [editando, setEditando] = useState(null);
  const [deletando, setDeletando] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('locais').select('id, nome, descricao, ativo').order('nome');
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const salvarNovo = async () => {
    setSalvando(true);
    await supabase.from('locais').insert([{ nome: novo.nome, descricao: novo.descricao, ativo: true }]);
    setNovo(null); setSalvando(false); fetch();
  };

  const salvarEdicao = async () => {
    const { id, ...rest } = editando;
    setSalvando(true);
    await supabase.from('locais').update(rest).eq('id', id);
    setEditando(null); setSalvando(false); fetch();
  };

  const toggleAtivo = async (row) => {
    await supabase.from('locais').update({ ativo: !row.ativo }).eq('id', row.id);
    fetch();
  };

  return (
    <div className="flex flex-col gap-3">
      {deletando && (
        <ConfirmDialog
          mensagem="Confirmar exclusão do local? Estoques vinculados não serão excluídos."
          onConfirm={async () => { await supabase.from('locais').delete().eq('id', deletando); setDeletando(null); fetch(); }}
          onCancel={() => setDeletando(null)}
        />
      )}
      <div className="flex justify-end">
        <button className="btn btn-primary flex items-center gap-1.5 text-[12px] px-4 py-2"
          onClick={() => setNovo({ nome: '', descricao: '' })} disabled={!!novo}>
          <Plus size={13} /> Novo Local
        </button>
      </div>
      <div className="table-wrapper">
        <table className="table-clean">
          <thead>
            <tr>
              <th>Nome</th><th>Descrição</th><th>Status</th><th className="text-right w-24">Ações</th>
            </tr>
          </thead>
          <tbody>
            {novo && (
              <tr className="bg-app-bg">
                <td><input type="text" value={novo.nome} onChange={e => setNovo(p => ({ ...p, nome: e.target.value }))} placeholder="Nome" className="input-base py-1.5 text-[12px] w-full" /></td>
                <td><input type="text" value={novo.descricao} onChange={e => setNovo(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição (opcional)" className="input-base py-1.5 text-[12px] w-full" /></td>
                <td>—</td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={salvarNovo} disabled={salvando} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600">{salvando ? <Spinner /> : <Check size={15} />}</button>
                    <button onClick={() => setNovo(null)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><X size={15} /></button>
                  </div>
                </td>
              </tr>
            )}
            {loading ? (
              <tr><td colSpan="4" className="text-center py-8 text-app-text-secondary text-[13px]">Carregando...</td></tr>
            ) : rows.map(row => (
              <tr key={row.id}>
                <td>
                  {editando?.id === row.id
                    ? <input type="text" value={editando.nome} onChange={e => setEditando(p => ({ ...p, nome: e.target.value }))} className="input-base py-1.5 text-[12px] w-full" />
                    : <span className="font-semibold">{row.nome}</span>}
                </td>
                <td>
                  {editando?.id === row.id
                    ? <input type="text" value={editando.descricao ?? ''} onChange={e => setEditando(p => ({ ...p, descricao: e.target.value }))} className="input-base py-1.5 text-[12px] w-full" />
                    : <span className="text-[12px] text-app-text-secondary">{row.descricao ?? '—'}</span>}
                </td>
                <td>
                  <button onClick={() => toggleAtivo(row)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${row.ativo ? 'badge badge-emerald' : 'badge badge-rose'}`}>
                    {row.ativo ? <><UserCheck size={11} /> Ativo</> : <><UserX size={11} /> Inativo</>}
                  </button>
                </td>
                <td className="text-right">
                  {editando?.id === row.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={salvarEdicao} disabled={salvando} className="p-1.5 rounded-lg hover:bg-emerald-100 text-emerald-600">{salvando ? <Spinner /> : <Check size={15} />}</button>
                      <button onClick={() => setEditando(null)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><X size={15} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditando({ ...row })} className="p-1.5 rounded-lg hover:bg-app-bg text-app-text-label hover:text-app-text"><Pencil size={14} /></button>
                      <button onClick={() => setDeletando(row.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-app-text-label hover:text-rose-500"><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
═══════════════════════════════════════════ */
const ABAS = ['Categorias', 'Unidades', 'Locais', 'Papéis', 'Usuários'];

export default function Configuracoes() {
  const { isAdmin } = useAuth();
  const [abaAtiva, setAbaAtiva] = useState('Categorias');
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
        <p className="text-[13px] text-app-text-secondary">Gerencie dados mestres e usuários do sistema.</p>
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
      {abaAtiva === 'Categorias' && (
        <TabelaSimples
          tabela="categorias"
          colunas={[{ field: 'nome', label: 'Nome' }]}
          labelNovo="Nova Categoria"
        />
      )}
      {abaAtiva === 'Unidades' && (
        <TabelaSimples
          tabela="unidades"
          colunas={[
            { field: 'sigla', label: 'Sigla' },
            { field: 'nome', label: 'Nome completo' },
          ]}
          labelNovo="Nova Unidade"
        />
      )}
      {abaAtiva === 'Locais' && <AbaLocais />}
      {abaAtiva === 'Papéis' && (
        <TabelaSimples
          tabela="papeis"
          colunas={[
            { field: 'nome', label: 'Nome' },
            { field: 'descricao', label: 'Descrição' },
          ]}
          labelNovo="Novo Papel"
        />
      )}
      {abaAtiva === 'Usuários' && <AbaUsuarios papeis={papeis} />}
    </div>
  );
}
