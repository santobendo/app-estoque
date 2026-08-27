import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useLocal } from '../contexts/LocalContext';
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
  /* Os locais vêm do contexto, não de uma consulta própria: lá cada um já
     carrega o pode_editar, que decide quem vincula local e edita o mínimo. */
  const { locais, localAtual, podeEditarAtual, podeEditarAlgum } = useLocal();

  const [produto, setProduto]       = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [unidades, setUnidades]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [erro, setErro]             = useState(null);

  const [editProduto, setEditProduto] = useState(null);  // { nome, categoria_id }
  const [novaAp, setNovaAp]           = useState(null);  // { descricao, quantidade_unitaria, unidade_id }
  const [editAp, setEditAp]           = useState(null);  // { id, descricao, quantidade_unitaria, unidade_id }
  const [salvando, setSalvando]       = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);  // { mensagem, onConfirm }
  const [editMin, setEditMin]         = useState(null);  // { estoqueId, valor }
  const [aEstocar, setAEstocar]       = useState([]);     // ids de apresentacao

  const fetch = useCallback(async () => {
    setLoading(true);
    const [{ data: prod, error: errProd }, { data: cats }, { data: units }] =
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
      ]);

    if (errProd) setErro(traduzErro(errProd));
    if (prod?.apresentacoes) {
      prod.apresentacoes.sort((a, b) => a.descricao.localeCompare(b.descricao));
    }
    setProduto(prod ?? null);
    setCategorias(cats ?? []);
    setUnidades(units ?? []);
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
    if (novaAp.locais.length === 0) {
      setErro('Selecione ao menos um local para a nova apresentação.');
      return;
    }
    setSalvando(true); setErro(null);
    /* Pela RPC, e não por insert direto: apresentação e vínculos de local
       entram na mesma transação. Em duas chamadas, a segunda falhando
       deixaria a apresentação órfã de local. */
    const { error } = await supabase.rpc('fn_adiciona_apresentacoes_produto', {
      p_produto_id: Number(id),
      p_apresentacoes: [{
        descricao: novaAp.descricao.trim() || produto.nome,
        quantidade_unitaria: Number(novaAp.quantidade_unitaria),
        unidade_id: Number(novaAp.unidade_id),
        locais: novaAp.locais.map(local_id => ({ local_id, quantidade_inicial: 0 })),
      }],
    });
    setSalvando(false);
    /* A RPC levanta mensagens próprias em português, então error.message é o
       melhor texto — exceto no 23505, que vem do índice de descrição única e
       chega cru, em inglês. */
    if (error) {
      setErro(error.code === '23505'
        ? `Este produto já tem uma apresentação chamada "${novaAp.descricao.trim()}".`
        : error.message || traduzErro(error));
      return;
    }
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
    /* Via RPC, e não UPDATE direto: RLS é por linha, não por coluna — dar
       UPDATE em estoques a um gestor liberaria também quantidade_atual, que
       só pode mudar pelo trigger de movimentações. */
    const { error } = await supabase.rpc('fn_define_estoque_minimo', {
      p_estoque_id: editMin.estoqueId,
      p_valor: valor,
    });
    /* A função levanta mensagens próprias, em português e específicas ("Sem
       permissão para alterar o estoque mínimo deste local"); traduzErro só
       entra se vier um erro de transporte. */
    if (error) { setErro(error.message || traduzErro(error)); return; }
    setEditMin(null);
    fetch();
  };

  /* Vincular local e mudar o mínimo são permissões por local; editar produto
     e apresentação continuam de admin, porque são dados globais. */
  const podeEditarLocal = (localId) =>
    locais.find(l => l.id === localId)?.pode_editar === true;

  /* Apresentações que ainda não têm estoque no local da barra. Se TODAS
     estiverem aqui, o produto simplesmente não é mantido neste local — e a
     ação que o usuário quer é vincular uma que já existe, não inventar
     outra. Ver DIVIDA_TECNICA.md, seção 5. */
  const apsForaDoLocalAtual = (produto?.apresentacoes ?? []).filter(
    ap => !ap.estoques.some(e => e.local_id === localAtual?.id)
  );
  const produtoEstaNoLocalAtual =
    (produto?.apresentacoes ?? []).length > apsForaDoLocalAtual.length;

  const estocarAqui = async () => {
    /* Filtra contra a lista atual: se o usuário marcou embalagens e depois
       trocou de local na barra, as marcas antigas não valem mais. */
    const ids = aEstocar.filter(apId => apsForaDoLocalAtual.some(ap => ap.id === apId));
    if (ids.length === 0) {
      setErro('Selecione ao menos uma embalagem para estocar aqui.');
      return;
    }
    setSalvando(true); setErro(null);
    const { error } = await supabase.rpc('fn_adiciona_apresentacoes_produto', {
      p_produto_id: Number(id),
      p_apresentacoes: ids.map(apId => ({
        id: apId,
        locais: [{ local_id: localAtual.id, quantidade_inicial: 0 }],
      })),
    });
    setSalvando(false);
    if (error) { setErro(error.message || traduzErro(error)); return; }
    setAEstocar([]);
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

  /* A apresentação nasce já vinculada ao local da barra superior. Sem isso
     ela ficaria sem local nenhum — invisível no catálogo, inclusive para
     admin — que é justamente o buraco que a busca-antes-de-criar fecha. */
  /* O bloco de "estocar aqui" só faz sentido quando o produto inteiro está
     fora do local: se ao menos uma embalagem já está aqui, o usuário já se
     orientou e o "+ Estocar em…" de cada linha basta. */
  const mostraEstocar =
    podeEditarAtual && !novaAp && !produtoEstaNoLocalAtual && apsForaDoLocalAtual.length > 0;

  const emptyNovaAp = () => ({
    descricao: '',
    quantidade_unitaria: '',
    unidade_id: unidades.length ? String(unidades[0].id) : '',
    locais: podeEditarAtual && localAtual ? [localAtual.id] : [],
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
          {/* O local vai no rótulo porque a lista abaixo mostra todos os locais:
              sem ele, nada na tela diz onde a apresentação vai parar. */}
          {podeEditarAtual && !mostraEstocar && (
            <button
              onClick={() => { setNovaAp(emptyNovaAp()); setEditAp(null); }}
              disabled={!!novaAp}
              className="btn btn-primary flex items-center gap-1.5 text-[12px] px-4 py-2 shrink-0"
            >
              <Plus size={13} /> Nova apresentação em {localAtual.nome}
            </button>
          )}
        </div>

        <div className="divide-y divide-app-border-inner">
          {/* Vincular embalagem existente ao local atual. Vem antes de tudo e
              leva o botão primário porque é a ação que o usuário quer quando
              cai aqui; criar embalagem nova é a exceção e virou link. */}
          {mostraEstocar && (
            <div className="p-6 bg-app-bg/50 flex flex-col gap-4">
              <div>
                <p className="text-[14px] font-bold text-app-text">
                  {produto.nome} ainda não é mantido em {localAtual.nome}.
                </p>
                <p className="text-[12px] text-app-text-secondary mt-0.5">
                  Escolha quais embalagens estocar aqui — elas já existem, não
                  precisam ser cadastradas de novo.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {apsForaDoLocalAtual.map(ap => {
                  const marcada = aEstocar.includes(ap.id);
                  const onde = ap.estoques.map(e => e.locais?.nome).filter(Boolean);
                  return (
                    <button
                      key={ap.id}
                      type="button"
                      onClick={() => setAEstocar(p =>
                        marcada ? p.filter(x => x !== ap.id) : [...p, ap.id]
                      )}
                      className={`flex items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 text-left transition-all ${
                        marcada
                          ? 'border-app-text bg-white'
                          : 'border-app-border bg-white/60 hover:border-app-text-label'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-[1.5px] ${
                        marcada
                          ? 'bg-app-text border-app-text text-white'
                          : 'border-app-border-dashed'
                      }`}>
                        {marcada && <Check size={11} />}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[13px] font-bold text-app-text">{ap.descricao}</span>
                        <span className="block text-[11px] text-app-text-secondary">
                          1 embalagem = {Number(ap.quantidade_unitaria)} {ap.unidades?.sigla}
                          {onde.length > 0 && ` · já em ${onde.join(', ')}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setNovaAp(emptyNovaAp()); setEditAp(null); setAEstocar([]); }}
                  className="text-[12px] text-app-text-secondary hover:text-app-text underline decoration-dotted underline-offset-2"
                >
                  Nenhuma serve? Criar apresentação nova
                </button>
                <button
                  onClick={estocarAqui}
                  disabled={salvando || aEstocar.length === 0}
                  className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-[12px]"
                >
                  {salvando ? <Spinner /> : <Plus size={13} />} Estocar em {localAtual.nome}
                </button>
              </div>
            </div>
          )}

          {/* Formulário de nova apresentação. Some se o usuário trocar para um
              local que só visualiza — deixá-lo aberto manteria em tela um
              formulário que o banco recusaria no fim. */}
          {novaAp && podeEditarAtual && (
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

              <div className="flex flex-col gap-2">
                <Label>Locais</Label>
                <div className="flex flex-wrap gap-2">
                  {locais.filter(l => l.pode_editar).map(l => {
                    const marcado = novaAp.locais.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setNovaAp(p => ({
                          ...p,
                          locais: marcado
                            ? p.locais.filter(x => x !== l.id)
                            : [...p.locais, l.id],
                        }))}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold border-[1.5px] transition-all ${
                          marcado
                            ? 'border-app-text bg-app-text text-white'
                            : 'border-app-border text-app-text-secondary hover:border-app-text-label'
                        }`}
                      >
                        <MapPin size={12} />
                        {l.nome}
                        {l.id === localAtual?.id && (
                          <span className="opacity-60 font-normal">· atual</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-app-text-secondary">
                  Começa com saldo zero em cada local — registre uma entrada em
                  Movimentações depois.
                </p>
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
              l => l.pode_editar && !ap.estoques.some(e => e.local_id === l.id)
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
                    {ap.estoques.map(e => {
                      /* Destaca o local da barra: a lista mistura todos os locais
                         visíveis, e sem marca o usuário não sabe qual deles é o
                         que as ações desta tela alcançam. */
                      const doLocalAtual = e.local_id === localAtual?.id;
                      return (
                      <span
                        key={e.id}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${
                          doLocalAtual
                            ? 'bg-white ring-[1.5px] ring-app-text/25'
                            : 'bg-app-bg'
                        }`}
                      >
                        <MapPin size={12} className={doLocalAtual ? 'text-app-text' : 'text-app-text-label'} />
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
                            disabled={!podeEditarLocal(e.local_id)}
                            onClick={() => setEditMin({ estoqueId: e.id, valor: Number(e.estoque_minimo) })}
                            title={podeEditarLocal(e.local_id) ? 'Estoque mínimo — clique para editar' : 'Estoque mínimo'}
                            className={`text-app-text-secondary ${podeEditarLocal(e.local_id) ? 'hover:text-app-text underline decoration-dotted underline-offset-2' : ''}`}
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
                      );
                    })}

                    {locaisDisponiveis.length > 0 && (
                      <select
                        value=""
                        onChange={e => vincularLocal(ap.id, e.target.value)}
                        className="input-base py-1.5 text-[12px] text-app-text-secondary w-auto"
                      >
                        <option value="" disabled>+ Estocar em…</option>
                        {locaisDisponiveis.map(l => (
                          <option key={l.id} value={l.id}>{l.nome}</option>
                        ))}
                      </select>
                    )}

                    {ap.estoques.length === 0 && locaisDisponiveis.length === 0 && (
                      <span className="text-[12px] text-app-text-secondary">
                        {podeEditarAlgum
                          ? 'Nenhum local ativo cadastrado.'
                          : 'Não vinculada a nenhum local que você acessa.'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {podeEditarAtual && (
        <p className="text-[12px] text-app-text-secondary">
          Locais recém-vinculados começam com saldo zero — registre uma entrada em{' '}
          <span className="font-semibold">Movimentações</span> para adicionar estoque.
        </p>
      )}
    </div>
  );
}
