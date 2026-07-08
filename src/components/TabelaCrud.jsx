import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Plus, Pencil, Trash2, Check, X, AlertCircle, UserCheck, UserX } from 'lucide-react';

/* ─── helpers compartilhados ─── */
export function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-app-text-label" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function ConfirmDialog({ mensagem, onConfirm, onCancel }) {
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

export function traduzErro(error) {
  if (!error) return null;
  switch (error.code) {
    case '23505': return 'Já existe um registro com esse nome/sigla.';
    case '23503': return 'Não é possível excluir: este registro está sendo usado em outro cadastro.';
    case '23502': return 'Preencha os campos obrigatórios.';
    case '42501': return 'Você não tem permissão para esta operação.';
    default:      return error.message;
  }
}

/* ─── CRUD genérico para tabelas de cadastro ───
   colunas:  [{ field, label, placeholder? }] — a 1ª coluna define a ordenação
   comAtivo: adiciona coluna Status com toggle ativo/inativo
   readOnly: esconde botões de criação/edição/exclusão               */
export default function TabelaCrud({ tabela, colunas, labelNovo, comAtivo = false, readOnly = false }) {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [novo, setNovo]           = useState(null);
  const [editando, setEditando]   = useState(null);
  const [deletando, setDeletando] = useState(null);
  const [salvando, setSalvando]   = useState(false);
  const [erro, setErro]           = useState(null);

  const totalColunas = colunas.length + (comAtivo ? 1 : 0) + (readOnly ? 0 : 1);

  const fetch = useCallback(async () => {
    setLoading(true);
    const campos = ['id', ...colunas.map(c => c.field), ...(comAtivo ? ['ativo'] : [])].join(', ');
    const { data, error } = await supabase.from(tabela).select(campos).order(colunas[0].field);
    if (error) setErro(traduzErro(error));
    setRows(data ?? []);
    setLoading(false);
  }, [tabela]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch(); }, [fetch]);

  const limparVazios = (obj) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v === '' ? null : v]));

  const salvarNovo = async () => {
    if (!novo) return;
    setSalvando(true); setErro(null);
    const payload = { ...limparVazios(novo), ...(comAtivo ? { ativo: true } : {}) };
    const { error } = await supabase.from(tabela).insert([payload]);
    setSalvando(false);
    if (error) { setErro(traduzErro(error)); return; }
    setNovo(null);
    fetch();
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    const { id, ...campos } = editando;
    setSalvando(true); setErro(null);
    const { error } = await supabase.from(tabela).update(limparVazios(campos)).eq('id', id);
    setSalvando(false);
    if (error) { setErro(traduzErro(error)); return; }
    setEditando(null);
    fetch();
  };

  const confirmarDelete = async () => {
    setErro(null);
    // .select() força o retorno das linhas excluídas — se vier vazio,
    // o RLS bloqueou silenciosamente e avisamos o usuário.
    const { data, error } = await supabase.from(tabela).delete().eq('id', deletando).select('id');
    setDeletando(null);
    if (error) { setErro(traduzErro(error)); return; }
    if (!data || data.length === 0) {
      setErro('Nada foi excluído — você não tem permissão para excluir este registro.');
      return;
    }
    fetch();
  };

  const toggleAtivo = async (row) => {
    setErro(null);
    const { error } = await supabase.from(tabela).update({ ativo: !row.ativo }).eq('id', row.id);
    if (error) { setErro(traduzErro(error)); return; }
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

      {erro && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[13px]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} className="p-1 hover:text-rose-900"><X size={14} /></button>
        </div>
      )}

      {!readOnly && (
        <div className="flex justify-end">
          <button
            className="btn btn-primary flex items-center gap-1.5 text-[12px] px-4 py-2"
            onClick={() => { setNovo(emptyNovo()); setEditando(null); }}
            disabled={!!novo}
          >
            <Plus size={13} /> {labelNovo}
          </button>
        </div>
      )}

      <div className="table-wrapper">
        <table className="table-clean">
          <thead>
            <tr>
              {colunas.map(c => <th key={c.field}>{c.label}</th>)}
              {comAtivo && <th>Status</th>}
              {!readOnly && <th className="text-right w-24">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {/* Linha de novo registro */}
            {novo && (
              <tr className="bg-app-bg">
                {colunas.map(c => (
                  <td key={c.field}>
                    <input
                      type="text"
                      value={novo[c.field]}
                      onChange={e => setNovo(p => ({ ...p, [c.field]: e.target.value }))}
                      placeholder={c.placeholder ?? c.label}
                      className="input-base py-1.5 text-[12px] w-full"
                    />
                  </td>
                ))}
                {comAtivo && <td>—</td>}
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
              <tr><td colSpan={totalColunas} className="text-center py-8 text-app-text-secondary text-[13px]">Carregando...</td></tr>
            ) : rows.length === 0 && !novo ? (
              <tr><td colSpan={totalColunas} className="text-center py-8 text-app-text-secondary text-[13px]">Nenhum registro.</td></tr>
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
                {comAtivo && (
                  <td>
                    <button
                      onClick={() => !readOnly && toggleAtivo(row)}
                      disabled={readOnly}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${
                        row.ativo ? 'badge badge-emerald' : 'badge badge-rose'
                      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    >
                      {row.ativo ? <><UserCheck size={11} /> Ativo</> : <><UserX size={11} /> Inativo</>}
                    </button>
                  </td>
                )}
                {!readOnly && (
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
                          onClick={() => { setEditando({ ...row }); setNovo(null); }}
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
