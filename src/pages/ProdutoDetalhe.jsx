import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronLeft, Package, Plus, Pencil, Trash2, Check, X,
  MapPin, AlertCircle, Box,
} from 'lucide-react';
import { ConfirmDialog, Spinner, traduzErro } from '../components/TabelaCrud';

function Label({ children }) {
  return <label className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">{children}</label>;
}

export default function ProdutoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [produto, setProduto]       = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [unidades, setUnidades]     = useState([]);
  const [locais, setLocais]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState(null);

  const [editProduto, setEditProduto] = useState(null);  // { nome, categoria_id }
  const [novaAp, setNovaAp]           = useState(null);  // { descricao, quantidade_unitaria, unidade_id }
  const [editAp, setEditAp]           = useState(null);  // { id, descricao, quantidade_unitaria, unidade_id }
  const [salvando, setSalvando]       = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);  // { mensagem, onConfirm }
  const [editMin, setEditMin]         = useState(null);  // { estoqueId, valor }

  const fetch = useCallback(async () => {
    setLoading(true);
    const [{ data: prod, error: errProd }, { data: cats }, { data: units }, { data: locs }] =
      await Promise.all([
        supabase
          .from('produtos')
          .select(`
            id, nome, categoria_id, categorias (nome),
            apresentacoes (
              id, descricao, quantidade_unitaria, unidade_id,
              unidades (sigla),
              estoques (id, quantidade_atual, estoque_minimo, local_id, locais (nome))
            )
          `)
          .eq('id', id)
          .single(),
        supabase.from('categorias').select('id, nome').order('nome'),
        supabase.from('unidades').select('id, sigla, nome').order('sigla'),
        supabase.from('locais').select('id, nome').eq('ativo', true).order('nome'),
      ]);

    if (errProd) setErro(traduzErro(errProd));
    if (prod?.apresentacoes) {
      prod.apresentacoes.sort((a, b) => a.descricao.localeCompare(b.descricao));
    }
    setProduto(prod ?? null);
    setCategorias(cats ?? []);
    setUnidades(units ?? []);
    setLocais(locs ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetch(); }, [fetch]);

  /* ─── Produto ─── */
  const salvarProduto = async () => {
    setSalvando(true); setErro(null);
    const { error } = await supabase
      .from('produtos')
      .update({
        nome: editProduto.nome.trim().toUpperCase(),
        categoria_id: editProduto.categoria_id ? Number(editProduto.categoria_id) : null,
      })
      .eq('id', id);
    setSalvando(false);
    if (error) { setErro(traduzErro(error)); return; }
    setEditProduto(null);
    fetch();
  };

  /* ─── Apresentações ─── */
  const validaAp = (ap) => {
    if (!ap.quantidade_unitaria || Number(ap.quantidade_unitaria) <= 0) {
      setErro('Quantidade unitária deve ser maior que zero.');
      return false;
    }
    if (!ap.unidade_id) {
      setErro('Selecione uma unidade de medida.');
      return false;
    }
    return true;
  };

  const salvarNovaAp = async () => {
    if (!validaAp(novaAp)) return;
    setSalvando(true); setErro(null);
    const { error } = await supabase.from('apresentacoes').insert([{
      produto_id: Number(id),
      descricao: novaAp.descricao.trim() || produto.nome,
      quantidade_unitaria: Number(novaAp.quantidade_unitaria),
      unidade_id: Number(novaAp.unidade_id),
    }]);
    setSalvando(false);
    if (error) { setErro(traduzErro(error)); return; }
    setNovaAp(null);
    fetch();
  };

  const salvarEditAp = async () => {
    if (!validaAp(editAp)) return;
    setSalvando(true); setErro(null);
    const { error } = await supabase
      .from('apresentacoes')
      .update({
        descricao: editAp.descricao.trim(),
        quantidade_unitaria: Number(editAp.quantidade_unitaria),
        unidade_id: Number(editAp.unidade_id),
      })
      .eq('id', editAp.id);
    setSalvando(false);
    if (error) { setErro(traduzErro(error)); return; }
    setEditAp(null);
    fetch();
  };

  const excluirAp = (ap) => {
    setConfirmacao({
      mensagem: `Excluir a apresentação "${ap.descricao}" e seus vínculos de local? Se houver movimentações registradas, a exclusão será bloqueada para preservar o histórico.`,
      onConfirm: async () => {
        setConfirmacao(null); setErro(null);
        // Remove primeiro os saldos (estoques) vinculados
        const { error: errEst } = await supabase
          .from('estoques').delete().eq('apresentacao_id', ap.id);
        if (errEst) {
          setErro(errEst.code === '23503'
            ? 'Não é possível excluir: esta apresentação possui movimentações registradas.'
            : traduzErro(errEst));
          return;
        }
        const { data, error } = await supabase
          .from('apresentacoes').delete().eq('id', ap.id).select('id');
        if (error) { setErro(traduzErro(error)); return; }
        if (!data || data.length === 0) {
          setErro('Nada foi excluído — você não tem permissão para excluir apresentações.');
          return;
        }
        fetch();
      },
    });
  };

  const salvarMinimo = async () => {
    if (!editMin) return;
    const valor = Math.max(Number(editMin.valor) || 0, 0);
    setErro(null);
    const { error } = await supabase
      .from('estoques')
      .update({ estoque_minimo: valor })
      .eq('id', editMin.estoqueId);
    if (error) { setErro(traduzErro(error)); return; }
    setEditMin(null);
    fetch();
  };

  /* ─── Vínculos com locais (estoques) ─── */
  const vincularLocal = async (apId, localId) => {
    if (!localId) return;
    setErro(null);
    const { error } = await supabase.from('estoques').insert([{
      apresentacao_id: apId,
      local_id: Number(localId),
      quantidade_atual: 0,
    }]);
    if (error) { setErro(traduzErro(error)); return; }
    fetch();
  };

  const desvincularLocal = (ap, estoque) => {
    const qtd = Number(estoque.quantidade_atual);
    setConfirmacao({
      mensagem: qtd > 0
        ? `O local "${estoque.locais?.nome}" ainda tem saldo de ${qtd} para "${ap.descricao}". Remover o vínculo descarta esse saldo. Continuar?`
        : `Remover o vínculo de "${ap.descricao}" com o local "${estoque.locais?.nome}"?`,
      onConfirm: async () => {
        setConfirmacao(null); setErro(null);
        const { data, error } = await supabase
          .from('estoques').delete().eq('id', estoque.id).select('id');
        if (error) {
          setErro(error.code === '23503'
            ? 'Não é possível remover: há movimentações registradas neste local. Desative o local ou zere o saldo via movimentação.'
            : traduzErro(error));
          return;
        }
        if (!data || data.length === 0) {
          setErro('Nada foi removido — apenas administradores podem desvincular locais.');
          return;
        }
        fetch();
      },
    });
  };

  /* ─────────── render ─────────── */
  if (loading) {
    return <div className="p-8 text-center text-app-text-secondary text-[13px]">Carregando...</div>;
  }

  if (!produto) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-app-text-secondary">
        <Package size={32} className="text-app-text-label" />
        <p className="text-[14px] font-semibold">Produto não encontrado.</p>
        <button className="btn btn-secondary px-4 py-2" onClick={() => navigate('/')}>
          Voltar ao Catálogo
        </button>
      </div>
    );
  }

  const emptyNovaAp = () => ({
    descricao: '',
    quantidade_unitaria: '',
    unidade_id: unidades.length ? String(unidades[0].id) : '',
  });

  return (
    <div className="flex flex-col gap-5">
      {confirmacao && (
        <ConfirmDialog
          mensagem={confirmacao.mensagem}
          onConfirm={confirmacao.onConfirm}
          onCancel={() => setConfirmacao(null)}
        />
      )}

      {/* Cabeçalho */}
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="p-1.5 rounded-lg hover:bg-app-border/60 text-app-text-secondary hover:text-app-text transition-all mt-1"
        >
          <ChevronLeft size={20} />
        </button>

        {editProduto ? (
          <div className="flex-1 flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5 flex-1 min-w-52">
              <Label>Nome do Produto</Label>
              <input
                type="text"
                value={editProduto.nome}
                onChange={e => setEditProduto(p => ({ ...p, nome: e.target.value.toUpperCase() }))}
                className="input-base"
              />
            </div>
            <div className="flex flex-col gap-1.5 w-52">
              <Label>Categoria</Label>
              <select
                value={editProduto.categoria_id ?? ''}
                onChange={e => setEditProduto(p => ({ ...p, categoria_id: e.target.value }))}
                className="input-base"
              >
                <option value="">Sem categoria</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pb-0.5">
              <button onClick={salvarProduto} disabled={salvando} className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-[12px]">
                {salvando ? <Spinner /> : <Check size={13} />} Salvar
              </button>
              <button onClick={() => setEditProduto(null)} className="btn btn-secondary px-4 py-2 text-[12px]">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl mb-0.5">{produto.nome}</h1>
              <p className="text-[13px] text-app-text-secondary">
                {produto.categorias?.nome ?? 'Sem categoria'} · {produto.apresentacoes.length}{' '}
                {produto.apresentacoes.length === 1 ? 'apresentação' : 'apresentações'}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setEditProduto({ nome: produto.nome, categoria_id: produto.categoria_id ?? '' })}
                className="btn btn-secondary flex items-center gap-1.5 text-[12px] px-4 py-2"
              >
                <Pencil size={13} /> Editar Produto
              </button>
            )}
          </div>
        )}
      </header>

      {erro && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[13px]">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} className="p-1 hover:text-rose-900"><X size={14} /></button>
        </div>
      )}

      {/* Apresentações */}
      <div className="card">
        <div className="px-6 py-4 border-b border-app-border-inner flex items-center justify-between">
          <div>
            <span className="text-[13px] font-bold text-app-text uppercase tracking-wide">Apresentações</span>
            <span className="text-[11px] text-app-text-secondary ml-2">embalagens / tamanhos</span>
          </div>
          <button
            onClick={() => { setNovaAp(emptyNovaAp()); setEditAp(null); }}
            disabled={!!novaAp}
            className="btn btn-primary flex items-center gap-1.5 text-[12px] px-4 py-2"
          >
            <Plus size={13} /> Nova Apresentação
          </button>
        </div>

        <div className="divide-y divide-app-border-inner">
          {/* Formulário de nova apresentação */}
          {novaAp && (
            <div className="p-6 bg-app-bg/50 flex flex-col gap-4">
              <span className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
                Nova apresentação
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>Descrição da Embalagem</Label>
                  <input
                    type="text"
                    value={novaAp.descricao}
                    onChange={e => setNovaAp(p => ({ ...p, descricao: e.target.value }))}
                    placeholder="Ex: Pacote 500g"
                    className="input-base"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Quantidade Unitária</Label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={novaAp.quantidade_unitaria}
                    onChange={e => setNovaAp(p => ({ ...p, quantidade_unitaria: e.target.value }))}
                    placeholder="Ex: 0.5"
                    className="input-base"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Unidade de Medida</Label>
                  <select
                    value={novaAp.unidade_id}
                    onChange={e => setNovaAp(p => ({ ...p, unidade_id: e.target.value }))}
                    className="input-base"
                  >
                    {unidades.map(u => (
                      <option key={u.id} value={u.id}>{u.sigla} — {u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNovaAp(null)} className="btn btn-secondary px-4 py-2 text-[12px]">Cancelar</button>
                <button onClick={salvarNovaAp} disabled={salvando} className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-[12px]">
                  {salvando ? <Spinner /> : <Check size={13} />} Salvar
                </button>
              </div>
            </div>
          )}

          {produto.apresentacoes.length === 0 && !novaAp && (
            <p className="p-8 text-center text-[13px] text-app-text-secondary">
              Nenhuma apresentação cadastrada para este produto.
            </p>
          )}

          {produto.apresentacoes.map(ap => {
            const locaisDisponiveis = locais.filter(
              l => !ap.estoques.some(e => e.local_id === l.id)
            );
            const emEdicao = editAp?.id === ap.id;

            return (
              <div key={ap.id} className="p-6 flex flex-col gap-4">
                {emEdicao ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <Label>Descrição da Embalagem</Label>
                      <input
                        type="text"
                        value={editAp.descricao}
                        onChange={e => setEditAp(p => ({ ...p, descricao: e.target.value }))}
                        className="input-base"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Quantidade Unitária</Label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={editAp.quantidade_unitaria}
                        onChange={e => setEditAp(p => ({ ...p, quantidade_unitaria: e.target.value }))}
                        className="input-base"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Unidade de Medida</Label>
                      <select
                        value={editAp.unidade_id}
                        onChange={e => setEditAp(p => ({ ...p, unidade_id: e.target.value }))}
                        className="input-base"
                      >
                        {unidades.map(u => (
                          <option key={u.id} value={u.id}>{u.sigla} — {u.nome}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3 flex gap-2 justify-end">
                      <button onClick={() => setEditAp(null)} className="btn btn-secondary px-4 py-2 text-[12px]">Cancelar</button>
                      <button onClick={salvarEditAp} disabled={salvando} className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-[12px]">
                        {salvando ? <Spinner /> : <Check size={13} />} Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-app-bg flex items-center justify-center text-app-text-label shrink-0">
                        <Box size={17} />
                      </div>
                      <div>
                        <p className="text-[14px] font-bold text-app-text">{ap.descricao}</p>
                        <p className="text-[12px] text-app-text-secondary">
                          1 embalagem = {Number(ap.quantidade_unitaria)} {ap.unidades?.sigla}
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditAp({ id: ap.id, descricao: ap.descricao, quantidade_unitaria: ap.quantidade_unitaria, unidade_id: String(ap.unidade_id) }); setNovaAp(null); }}
                          className="p-1.5 rounded-lg hover:bg-app-bg text-app-text-label hover:text-app-text transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => excluirAp(ap)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 text-app-text-label hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Locais vinculados */}
                {!emEdicao && (
                  <div className="flex flex-wrap items-center gap-2">
                    {ap.estoques.map(e => (
                      <span
                        key={e.id}
                        className="inline-flex items-center gap-1.5 bg-app-bg rounded-lg px-2.5 py-1.5 text-[12px]"
                      >
                        <MapPin size={12} className="text-app-text-label" />
                        <span className="font-semibold">{e.locais?.nome}</span>
                        <span className="text-app-text-secondary">· {Number(e.quantidade_atual)} emb.</span>
                        {editMin?.estoqueId === e.id ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-app-text-label">· mín</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              autoFocus
                              value={editMin.valor}
                              onChange={ev => setEditMin(p => ({ ...p, valor: ev.target.value }))}
                              onKeyDown={ev => {
                                if (ev.key === 'Enter') salvarMinimo();
                                if (ev.key === 'Escape') setEditMin(null);
                              }}
                              className="w-14 input-base py-0.5 px-1.5 text-[11px] text-center"
                            />
                            <button onClick={salvarMinimo} className="text-emerald-600 hover:text-emerald-700">
                              <Check size={12} />
                            </button>
                          </span>
                        ) : (
                          <button
                            disabled={!isAdmin}
                            onClick={() => setEditMin({ estoqueId: e.id, valor: Number(e.estoque_minimo) })}
                            title={isAdmin ? 'Estoque mínimo — clique para editar' : 'Estoque mínimo'}
                            className={`text-app-text-secondary ${isAdmin ? 'hover:text-app-text underline decoration-dotted underline-offset-2' : ''}`}
                          >
                            · mín {Number(e.estoque_minimo)}
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => desvincularLocal(ap, e)}
                            title="Remover vínculo"
                            className="text-app-text-label hover:text-rose-500 transition-colors ml-0.5"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}

                    {locaisDisponiveis.length > 0 && (
                      <select
                        value=""
                        onChange={e => vincularLocal(ap.id, e.target.value)}
                        className="input-base py-1.5 text-[12px] text-app-text-secondary w-auto"
                      >
                        <option value="" disabled>+ Vincular local…</option>
                        {locaisDisponiveis.map(l => (
                          <option key={l.id} value={l.id}>{l.nome}</option>
                        ))}
                      </select>
                    )}

                    {ap.estoques.length === 0 && locaisDisponiveis.length === 0 && (
                      <span className="text-[12px] text-app-text-secondary">Nenhum local ativo cadastrado.</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[12px] text-app-text-secondary">
        Locais recém-vinculados começam com saldo zero — registre uma entrada em{' '}
        <span className="font-semibold">Movimentações</span> para adicionar estoque.
      </p>
    </div>
  );
}
