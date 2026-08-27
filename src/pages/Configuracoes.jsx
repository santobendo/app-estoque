import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, ShieldOff, UserCheck, UserX, AlertCircle, X,
  Plus, Eye, EyeOff, UserPlus, Info, AtSign, Pencil,
  MapPin, Minus, SlidersHorizontal, TriangleAlert,
} from 'lucide-react';
import TabelaCrud, { ConfirmDialog, Spinner, traduzErro } from '../components/TabelaCrud';

const DOMINIO = '@estoque.com';

// Sanitiza o nome de usuário para garantir formato de e-mail válido (sem espaços, acentos ou caracteres especiais)
function sanitizarUsuario(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/\s+/g, '.')            // substitui espaços por ponto
    .replace(/[^a-z0-9._-]/g, '');   // remove caracteres não permitidos em e-mail
}

/* ─────────────────────────────────────────────
   Modal: Criar Novo Usuário
   Usa supabase.auth.signUp() + atualiza perfis
───────────────────────────────────────────── */
function ModalNovoUsuario({ papeis, onSucesso, onFechar }) {
  const [form, setForm] = useState({
    nome: '',
    usuario: '',   // será convertido em usuario@estoque.com
    senha: '',
    is_admin: false,
    papel_id: '',
  });
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando]         = useState(false);
  const [erro, setErro]                 = useState(null);
  const [aviso, setAviso]               = useState(null);

  const set = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const usuarioSanitizado = sanitizarUsuario(form.usuario);

    if (!form.nome.trim())      { setErro('Informe o nome do usuário.');        return; }
    if (!usuarioSanitizado)     { setErro('Informe um nome de usuário válido (letras e números).'); return; }
    if (form.senha.length < 6)  { setErro('A senha deve ter pelo menos 6 caracteres.'); return; }

    setSalvando(true);
    setErro(null);
    setAviso(null);

    // Monta o e-mail fictício sanitizado
    const email = usuarioSanitizado + DOMINIO;

    // 1. Cria o usuário no Supabase Auth
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password: form.senha,
      options: {
        data: { nome: form.nome.trim() }, // passado ao trigger fn_cria_perfil
      },
    });

    if (signUpError) {
      setSalvando(false);
      const msg = signUpError.message?.toLowerCase() ?? '';
      if (msg.includes('already registered') || msg.includes('already been registered')) {
        setErro(`O nome de usuário "${form.usuario.trim()}" já está em uso. Escolha outro.`);
      } else if (msg.includes('rate limit') || msg.includes('too many')) {
        setErro('Limite temporário de envio de e-mails atingido no Supabase (Rate Limit). Isso ocorre porque a confirmação por e-mail está ATIVADA no Supabase. Para resolver de vez, desative a opção "Confirm email" no Supabase Dashboard (Authentication → Providers → Email / Settings).');
      } else if (msg.includes('password')) {
        setErro('Senha inválida — use pelo menos 6 caracteres.');
      } else {
        setErro(signUpError.message);
      }
      return;
    }

    const novoUserId = data?.user?.id;

    // 2. Detecta se o e-mail de confirmação está ativo
    //    Quando ativo, data.user.identities é um array vazio ou
    //    data.session é null e data.user.email_confirmed_at é null.
    const precisaConfirmar =
      !data?.session &&
      !data?.user?.email_confirmed_at &&
      data?.user?.identities?.length === 0;

    if (precisaConfirmar) {
      // Usuário criado mas aguardando confirmação de e-mail
      setSalvando(false);
      setAviso(
        `Usuário criado! Como a confirmação de e-mail está ativa no Supabase, ` +
        `"${form.usuario.trim()}" precisará confirmar antes de conseguir logar. ` +
        `Para desativar essa exigência, acesse Authentication → Settings no Supabase Dashboard.`
      );
      // Ainda tentamos atualizar o perfil se o ID veio
      if (novoUserId) {
        await supabase.from('perfis').update({
          nome: form.nome.trim(),
          is_admin: form.is_admin,
          papel_id: form.papel_id ? Number(form.papel_id) : null,
        }).eq('id', novoUserId);
      }
      onSucesso?.();
      return;
    }

    // 3. Atualiza o perfil com nome correto, is_admin e papel_id
    //    (o trigger já criou a linha, mas pode ter usado o e-mail como nome)
    if (novoUserId) {
      const { error: perfilError } = await supabase.from('perfis').update({
        nome: form.nome.trim(),
        is_admin: form.is_admin,
        papel_id: form.papel_id ? Number(form.papel_id) : null,
      }).eq('id', novoUserId);

      if (perfilError) {
        setSalvando(false);
        setErro('Usuário criado, mas houve um erro ao salvar o perfil: ' + traduzErro(perfilError));
        return;
      }
    }

    setSalvando(false);
    onSucesso?.();
    onFechar();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-content max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-bg flex items-center justify-center text-app-text">
              <UserPlus size={16} />
            </div>
            <h2 className="text-[15px] font-bold text-app-text">Novo Usuário</h2>
          </div>
          <button
            onClick={onFechar}
            className="p-1.5 rounded-lg text-app-text-label hover:text-app-text hover:bg-app-bg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3.5 py-2.5 text-[12px] mb-4">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro(null)} className="p-0.5 hover:text-rose-900 shrink-0"><X size={12} /></button>
          </div>
        )}

        {/* Aviso confirmação de e-mail */}
        {aviso && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3.5 py-2.5 text-[12px] mb-4">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{aviso}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
              Nome <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              placeholder="Nome completo"
              className="input-base py-2 text-[13px]"
              autoFocus
              disabled={salvando}
            />
          </div>

          {/* Usuário */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
              Usuário <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label shrink-0" size={15} />
              <input
                type="text"
                value={form.usuario}
                onChange={e => set('usuario', sanitizarUsuario(e.target.value))}
                placeholder="nome.sobrenome"
                className="input-base py-2 text-[13px] pl-9 pr-[110px] w-full"
                disabled={salvando}
                autoCapitalize="none"
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-app-text-label/50 select-none pointer-events-none font-mono"
                aria-hidden="true"
              >
                {DOMINIO}
              </span>
            </div>
            <p className="text-[11px] text-app-text-label">Usado para login no sistema (apenas letras, números e pontos).</p>
          </div>

          {/* Senha */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
              Senha temporária <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={form.senha}
                onChange={e => set('senha', e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="input-base py-2 text-[13px] pr-10 w-full"
                disabled={salvando}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-text-label hover:text-app-text transition-colors"
                tabIndex={-1}
              >
                {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Linha: Papel + Admin */}
          <div className="flex gap-3">
            {/* Papel */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
                Papel
              </label>
              <select
                value={form.papel_id}
                onChange={e => set('papel_id', e.target.value)}
                className="input-base py-2 text-[13px]"
                disabled={salvando}
              >
                <option value="">Sem papel</option>
                {papeis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            {/* Admin toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
                Tipo
              </label>
              <button
                type="button"
                onClick={() => set('is_admin', !form.is_admin)}
                disabled={salvando}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-semibold transition-all h-[38px] ${
                  form.is_admin
                    ? 'bg-violet-50 border-violet-300 text-violet-700'
                    : 'bg-app-bg border-app-border text-app-text-secondary hover:text-app-text'
                }`}
              >
                {form.is_admin ? <><Shield size={13} /> Admin</> : <><ShieldOff size={13} /> Padrão</>}
              </button>
            </div>
          </div>

          {/* Info sobre permissões */}
          <div className="rounded-lg bg-app-bg border border-app-border-inner px-3.5 py-2.5 text-[11.5px] text-app-text-secondary leading-relaxed">
            {form.is_admin
              ? <><span className="font-semibold text-violet-700">Administrador:</span> pode criar e editar cadastros, gerenciar usuários e acessar configurações.</>
              : <><span className="font-semibold text-app-text">Usuário padrão:</span> pode consultar o catálogo e registrar movimentações de estoque. Não pode criar ou editar cadastros mestres.</>
            }
          </div>

          {/* Ações */}
          <div className="flex gap-3 justify-end pt-1">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="btn btn-secondary px-4 py-2 text-[13px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-[13px]"
            >
              {salvando ? <><Spinner /> Criando...</> : <><UserPlus size={14} /> Criar Usuário</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Modal: Editar Usuário
───────────────────────────────────────────── */
function ModalEditarUsuario({ usuario, papeis, isMe, onSucesso, onFechar }) {
  const [nome, setNome]       = useState(usuario.nome || '');
  const [papelId, setPapelId] = useState(usuario.papel_id ?? '');
  const [isAdmin, setIsAdmin] = useState(usuario.is_admin ?? false);
  const [ativo, setAtivo]     = useState(usuario.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim()) { setErro('Informe o nome do usuário.'); return; }

    setSalvando(true);
    setErro(null);

    const payload = {
      nome: nome.trim(),
      papel_id: papelId ? Number(papelId) : null,
      is_admin: isMe ? usuario.is_admin : isAdmin,
      ativo: isMe ? usuario.ativo : ativo,
    };

    const { error } = await supabase.from('perfis').update(payload).eq('id', usuario.id);
    setSalvando(false);

    if (error) {
      setErro(traduzErro(error));
      return;
    }

    onSucesso?.();
    onFechar();
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-content max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-bg flex items-center justify-center text-app-text">
              <Pencil size={16} />
            </div>
            <h2 className="text-[15px] font-bold text-app-text">Editar Usuário</h2>
          </div>
          <button
            onClick={onFechar}
            className="p-1.5 rounded-lg text-app-text-label hover:text-app-text hover:bg-app-bg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Erro */}
        {erro && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3.5 py-2.5 text-[12px] mb-4">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro(null)} className="p-0.5 hover:text-rose-900 shrink-0"><X size={12} /></button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
              Nome <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome completo"
              className="input-base py-2 text-[13px]"
              autoFocus
              disabled={salvando}
            />
          </div>

          {/* Linha: Papel + Tipo */}
          <div className="flex gap-3">
            {/* Papel */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
                Papel
              </label>
              <select
                value={papelId}
                onChange={e => setPapelId(e.target.value)}
                className="input-base py-2 text-[13px]"
                disabled={salvando}
              >
                <option value="">Sem papel</option>
                {papeis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            {/* Admin toggle */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
                Tipo
              </label>
              <button
                type="button"
                onClick={() => !isMe && setIsAdmin(!isAdmin)}
                disabled={salvando || isMe}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[12px] font-semibold transition-all h-[38px] ${
                  isAdmin
                    ? 'bg-violet-50 border-violet-300 text-violet-700'
                    : 'bg-app-bg border-app-border text-app-text-secondary hover:text-app-text'
                } ${isMe ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isAdmin ? <><Shield size={13} /> Admin</> : <><ShieldOff size={13} /> Padrão</>}
              </button>
            </div>
          </div>

          {/* Status (Ativo / Inativo) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-app-text-secondary uppercase tracking-wide">
              Status da Conta
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => !isMe && setAtivo(true)}
                disabled={salvando || isMe}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-semibold transition-all ${
                  ativo ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-app-bg border-app-border text-app-text-secondary'
                } ${isMe ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <UserCheck size={14} /> Ativo
              </button>
              <button
                type="button"
                onClick={() => !isMe && setAtivo(false)}
                disabled={salvando || isMe}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-[12px] font-semibold transition-all ${
                  !ativo ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-app-bg border-app-border text-app-text-secondary'
                } ${isMe ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <UserX size={14} /> Inativo
              </button>
            </div>
            {isMe && <p className="text-[11px] text-app-text-label">Você não pode alterar seu próprio status ou nível de permissão.</p>}
          </div>

          {/* Ações */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onFechar}
              disabled={salvando}
              className="btn btn-secondary px-4 py-2 text-[13px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-[13px]"
            >
              {salvando ? <><Spinner /> Salvando...</> : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Aba Usuários ─── */
function AbaUsuarios({ papeis }) {
  const { user: currentUser } = useAuth();
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [confirmacao, setConfirmacao] = useState(null);
  const [erro, setErro]               = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);

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
        const { error } = await supabase.from('perfis').update({ ativo: novoValor }).eq('id', row.id);
        setConfirmacao(null);
        if (error) { setErro(traduzErro(error)); return; }
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
        const { error } = await supabase.from('perfis').update({ is_admin: novoValor }).eq('id', row.id);
        setConfirmacao(null);
        if (error) { setErro(traduzErro(error)); return; }
        fetch();
      }
    });
  };

  const alterarPapel = async (id, papelId) => {
    setErro(null);
    const { error } = await supabase.from('perfis').update({ papel_id: papelId ? Number(papelId) : null }).eq('id', id);
    if (error) { setErro(traduzErro(error)); return; }
    fetch();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header da aba com botão Novo Usuário */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-app-text-secondary">
          {rows.length > 0 ? `${rows.length} usuário${rows.length !== 1 ? 's' : ''} cadastrado${rows.length !== 1 ? 's' : ''}` : ''}
        </p>
        <button
          className="btn btn-primary flex items-center gap-1.5 text-[12px] px-4 py-2"
          onClick={() => setModalAberto(true)}
        >
          <Plus size={13} /> Novo Usuário
        </button>
      </div>

      {erro && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[13px]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} className="p-1 hover:text-rose-900"><X size={14} /></button>
        </div>
      )}

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
              <th>Tipo</th>
              <th>Papel</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="text-center py-8 text-app-text-secondary text-[13px]">Carregando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-8 text-app-text-secondary text-[13px]">Nenhum usuário cadastrado.</td></tr>
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
                  <td className="text-right">
                    <button
                      onClick={() => setUsuarioEditando(row)}
                      className="p-1.5 rounded-lg hover:bg-app-bg text-app-text-label hover:text-app-text transition-colors"
                      title="Editar usuário"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Novo Usuário */}
      {modalAberto && (
        <ModalNovoUsuario
          papeis={papeis}
          onSucesso={() => fetch()}
          onFechar={() => setModalAberto(false)}
        />
      )}

      {/* Modal Editar Usuário */}
      {usuarioEditando && (
        <ModalEditarUsuario
          usuario={usuarioEditando}
          papeis={papeis}
          isMe={usuarioEditando.id === currentUser?.id}
          onSucesso={() => fetch()}
          onFechar={() => setUsuarioEditando(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Aba Acessos — matriz usuários × locais

   A matriz responde as duas perguntas do admin ao mesmo tempo: lendo a
   linha, o que aquele usuário alcança; lendo a coluna, quem alcança
   aquele local. Uma lista por usuário só responderia a primeira.

   Cada célula cicla em três estados a cada clique — mesmo padrão dos
   badges de Admin e Ativo da aba Usuários.
───────────────────────────────────────────── */
const NIVEIS = {
  nenhum:    { proximo: 'visualiza', rotulo: 'Sem acesso' },
  visualiza: { proximo: 'gerencia',  rotulo: 'Visualiza'  },
  gerencia:  { proximo: 'nenhum',    rotulo: 'Gerencia'   },
};

const chaveAcesso = (usuarioId, localId) => usuarioId + ':' + localId;

function CelulaAcesso({ nivel, desabilitada, onClick }) {
  if (desabilitada) {
    return (
      <div
        className="flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md badge badge-violet text-[11px] font-bold uppercase tracking-wide"
        title="Administradores acessam todos os locais — não precisam de concessão."
      >
        <Shield size={11} /> Total
      </div>
    );
  }

  const estilos = {
    nenhum:    'bg-app-bg text-app-text-label hover:text-app-text',
    visualiza: 'badge badge-sky',
    gerencia:  'badge badge-emerald',
  };
  const icones = {
    nenhum:    <Minus size={11} />,
    visualiza: <Eye size={11} />,
    gerencia:  <SlidersHorizontal size={11} />,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Clique para alterar o nível de acesso"
      className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all cursor-pointer ${estilos[nivel]}`}
    >
      {icones[nivel]} {NIVEIS[nivel].rotulo}
    </button>
  );
}

function AbaAcessos() {
  const { user: currentUser } = useAuth();
  const [perfis, setPerfis]   = useState([]);
  const [locais, setLocais]   = useState([]);
  const [acessos, setAcessos] = useState(new Map());   // "usuario:local" -> pode_editar
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);

  /* Sem setLoading(true) aqui de propósito: 'loading' já nasce true para a
     carga inicial, e o refetch que segue um erro atualiza a matriz no lugar,
     sem piscar o "Carregando..." por cima de uma grade que já está na tela. */
  const fetch = useCallback(async () => {
    const [{ data: pfs }, { data: locs }, { data: uls }] = await Promise.all([
      supabase.from('perfis').select('id, nome, is_admin, ativo, papeis(nome)').order('nome'),
      supabase.from('locais').select('id, nome, ativo').order('nome'),
      supabase.from('usuarios_locais').select('usuario_id, local_id, pode_editar'),
    ]);
    setPerfis(pfs ?? []);
    setLocais(locs ?? []);
    setAcessos(new Map((uls ?? []).map(a => [chaveAcesso(a.usuario_id, a.local_id), a.pode_editar])));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const nivelDe = (usuarioId, localId) => {
    const podeEditar = acessos.get(chaveAcesso(usuarioId, localId));
    if (podeEditar === undefined) return 'nenhum';
    return podeEditar ? 'gerencia' : 'visualiza';
  };

  /* Aplica na tela antes da resposta do servidor: com vários cliques seguidos,
     esperar o round-trip a cada célula deixaria a matriz lenta de usar.
     Se o servidor recusar, o erro aparece e o fetch devolve o estado real. */
  const alterarAcesso = async (usuario, local) => {
    const nivelNovo = NIVEIS[nivelDe(usuario.id, local.id)].proximo;
    const k = chaveAcesso(usuario.id, local.id);

    setErro(null);
    setAcessos(prev => {
      const m = new Map(prev);
      if (nivelNovo === 'nenhum') m.delete(k);
      else m.set(k, nivelNovo === 'gerencia');
      return m;
    });

    const { error } = nivelNovo === 'nenhum'
      ? await supabase.from('usuarios_locais').delete()
          .eq('usuario_id', usuario.id).eq('local_id', local.id)
      : await supabase.from('usuarios_locais').upsert({
          usuario_id:  usuario.id,
          local_id:    local.id,
          pode_editar: nivelNovo === 'gerencia',
          criado_por:  currentUser?.id ?? null,
        }, { onConflict: 'usuario_id,local_id' });

    if (error) { setErro(traduzErro(error)); fetch(); }
  };

  const comuns = useMemo(() => perfis.filter(p => !p.is_admin), [perfis]);

  /* Local sem nenhum usuário comum: só administradores enxergam o estoque dele. */
  const locaisOrfaos = useMemo(() => new Set(
    locais
      .filter(l => !comuns.some(u => acessos.has(chaveAcesso(u.id, l.id))))
      .map(l => l.id)
  ), [locais, comuns, acessos]);

  /* Usuário comum sem local nenhum: entra no sistema e não vê nada. */
  const semAcesso = (u) => !u.is_admin && !locais.some(l => acessos.has(chaveAcesso(u.id, l.id)));

  const totalSemAcesso = comuns.filter(u => u.ativo && semAcesso(u)).length;

  if (loading) {
    return <p className="text-[13px] text-app-text-secondary py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-app-bg border border-app-border-inner px-3.5 py-2.5 text-[11.5px] text-app-text-secondary leading-relaxed flex items-start gap-2">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          Clique numa célula para alternar entre <span className="font-semibold">Sem acesso</span>,{' '}
          <span className="font-semibold">Visualiza</span> (só leitura) e{' '}
          <span className="font-semibold">Gerencia</span> (movimenta estoque e edita o mínimo).
          Administradores acessam todos os locais e não aparecem para edição.
        </span>
      </div>

      {totalSemAcesso > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3.5 py-2.5 text-[12px]">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <span>
            {totalSemAcesso === 1
              ? '1 usuário ativo não tem acesso a nenhum local'
              : `${totalSemAcesso} usuários ativos não têm acesso a nenhum local`}
            {' '}— eles conseguem entrar no sistema, mas não enxergam estoque nenhum.
          </span>
        </div>
      )}

      {erro && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[13px]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} className="p-1 hover:text-rose-900"><X size={14} /></button>
        </div>
      )}

      {locais.length === 0 ? (
        <p className="text-[13px] text-app-text-secondary py-8 text-center">
          Nenhum local cadastrado.
        </p>
      ) : (
        <div className="table-wrapper overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white z-10 min-w-[180px]">Usuário</th>
                {locais.map(l => (
                  <th key={l.id} className="min-w-[130px]">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={11} className="text-app-text-label shrink-0" />
                      <span className={l.ativo ? '' : 'line-through opacity-60'}>{l.nome}</span>
                      {locaisOrfaos.has(l.id) && (
                        <TriangleAlert
                          size={12}
                          className="text-amber-500 shrink-0"
                          title="Nenhum usuário comum tem acesso a este local — só administradores enxergam o estoque dele."
                        />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perfis.length === 0 ? (
                <tr>
                  <td colSpan={locais.length + 1} className="text-center py-8 text-app-text-secondary text-[13px]">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : perfis.map(u => (
                <tr key={u.id} className={!u.ativo ? 'opacity-60 bg-gray-50/35' : ''}>
                  <td className="sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[13px] truncate">{u.nome}</p>
                        <p className="text-[10px] text-app-text-label uppercase tracking-wide">
                          {u.is_admin ? 'Administrador' : (u.papeis?.nome ?? 'Sem papel')}
                          {!u.ativo && ' · inativo'}
                        </p>
                      </div>
                      {u.ativo && semAcesso(u) && (
                        <TriangleAlert
                          size={13}
                          className="text-amber-500 shrink-0"
                          title="Sem acesso a nenhum local — este usuário não enxerga estoque nenhum."
                        />
                      )}
                    </div>
                  </td>
                  {locais.map(l => (
                    <td key={l.id}>
                      <CelulaAcesso
                        nivel={nivelDe(u.id, l.id)}
                        desabilitada={u.is_admin}
                        onClick={() => alterarAcesso(u, l)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-app-text-label">
        Usuário inativo não enxerga nada, mesmo com acesso concedido aqui — o
        status em <span className="font-semibold">Usuários</span> vem antes destas regras.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Página principal
   Obs: Categorias, Unidades e Locais migraram
   para o menu Cadastros (/cadastros).
═══════════════════════════════════════════ */
const ABAS = ['Usuários', 'Acessos', 'Papéis'];

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
        <p className="text-[13px] text-app-text-secondary">Gerencie usuários, acessos por local e papéis do sistema.</p>
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
      {abaAtiva === 'Acessos' && <AbaAcessos />}
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
