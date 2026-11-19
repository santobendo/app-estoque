import React, { useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/auth';
import { useLocal } from '../contexts/local';
import {
  ChevronLeft, FileStack, Plus, Pencil, Trash2, Check, X, AlertCircle,
  MessageSquareText, ArrowUpCircle, Lock, Unlock,
} from 'lucide-react';
import { ConfirmDialog, Spinner } from '../components/TabelaCrud';
import ProdutoBusca from '../components/ProdutoBusca';
import SituacaoBadge from '../components/SituacaoBadge';
import { Label } from '../components/Secao';
import { traduzErro } from '../lib/erros';
import { useToast } from '../lib/toast';
import { useCarregamento } from '../lib/useCarregamento';
import { formatarDataHora, dataHoraParaInput } from '../lib/datas';
import { situacaoDe } from '../lib/requisicoes';

/* ─── Tela da requisição ───
   O pedido visto de dentro: cabeçalho editável, itens com solicitada,
   entregue e saldo, e as duas edições que a migração 10 liberou para o
   gerente — corrigir a quantidade de um item e tirar uma linha.

   Encerrar e reabrir moram aqui também: `fechada_em` é coluna comum, coberta
   pela mesma policy de update do cabeçalho e fora da lista de negação do
   tg_protege_requisicao — quem edita o cabeçalho encerra, e desfaz.

   A entrega não acontece aqui: o botão leva a Movimentações já vinculada ao
   número, que é onde moram saldo, motivo e o combobox. E só aparece para
   admin, porque a seção de requisição de lá é de admin — decisão do Matheus em
   17/11/2026, registrada no REQUISICOES_TELAS_PLANO.md com o que é preciso
   mexer no dia em que ela mudar.

   Como a lista, esta tela não segue o local da barra superior: a requisição
   cruza locais por desenho. O que o acesso limita são os ITENS — o RLS da
   vw_requisicao_itens devolve só os dos locais que o usuário enxerga, então
   dois usuários podem abrir a mesma requisição e ver listas diferentes. A
   tela avisa quando o que ela mostra é um recorte. */

/* Espelho, na tela, do predicado da policy "gestores podem atualizar
   requisicoes". Três braços, e cada um existe por um caso: admin; quem
   digitou (que cobre o cabeçalho recém-criado, ainda sem item); e quem
   gerencia o local de algum item. Se divergir da policy o sintoma é feio mas
   não é perigoso: os campos abrem e o banco recusa na hora de salvar — a
   autoridade continua sendo o RLS, isto aqui é só para não oferecer o que vai
   ser negado. */
function podeEditarCabecalho({ cabecalho, itens, isAdmin, userId, podeEditarLocal }) {
  if (!cabecalho) return false;
  if (isAdmin) return true;
  if (cabecalho.digitado_por === userId) return true;
  return itens.some(i => podeEditarLocal(i.local_id));
}

/* As quantidades são numeric(12,4) no banco, mas somadas aqui viram float:
   sem isto 0.1 + 0.2 apareceria como 0.30000000000000004 no rodapé. */
const arred = (n) => Number(n.toFixed(4));

/* Descreve a consequência antes de confirmar, como o Histórico faz na
   exclusão de movimentação. Os dois casos são bem diferentes: tirar uma linha
   que ninguém entregou não perde nada, e tirar uma entregue apaga o vínculo
   das movimentações com a requisição — por isso o segundo texto é mais longo
   e só admin chega nele. */
function mensagemExclusaoItem(i) {
  const entregue = Number(i.quantidade_entregue);
  const alvo = `${i.produto} (${i.apresentacao}) em ${i.local}`;

  if (entregue > 0) {
    return `O item ${alvo} já tem ${entregue} entregue em movimentações. `
      + 'Excluí-lo faz essas movimentações perderem o vínculo com a requisição: elas '
      + 'continuam no Histórico e o saldo do estoque não muda, mas a coluna "Req" fica '
      + 'em branco e não há como refazer o vínculo. Continuar?';
  }
  return `Excluir o item ${alvo}? Nenhuma entrega aponta para ele, então nada do `
    + 'histórico se perde — só o registro de que este item foi pedido.';
}

/* Encerrar é o caso "pedi 10, só tinha 8, está encerrada assim": o pedido sai
   da lista de pendências sem que ninguém minta que foi atendido. A confirmação
   diz o tamanho do que fica para trás, porque esse é o ponto da decisão. */
function mensagemEncerrar(id, pendentes, faltando) {
  if (pendentes === 0) {
    return `Encerrar a requisição #${id}? Ela sai da lista de pendências. Dá para reabrir depois.`;
  }
  const item = pendentes === 1 ? '1 item' : `${pendentes} itens`;
  return `Encerrar a requisição #${id}? ${item} ainda devem ${faltando} embalagens, e ficam `
    + 'registrados assim — pedido e não atendido. Ela sai da lista de pendências, e dá para '
    + 'reabrir depois.';
}

function Aviso({ texto }) {
  return (
    <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2.5 text-[12px]">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <span>{texto}</span>
    </div>
  );
}

export default function RequisicaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  /* Os locais vêm do contexto, que já traz o pode_editar de cada um — a mesma
     fonte que o ProdutoDetalhe usa para decidir quem edita o quê. */
  const { locais, localAtual } = useLocal();
  const toast = useToast();

  /* Os três estados de edição começam em null e são semeados no clique, nunca
     por efeito: o dado chega depois do primeiro render, e copiar resposta
     para estado dentro de useEffect é a cascata que o useCarregamento existe
     para evitar. É o mesmo desenho do ProdutoDetalhe. */
  const [editCab, setEditCab]         = useState(null);  // { data, observacoes, digitado_por, entregue_por, focoObs }
  const [editItem, setEditItem]       = useState(null);  // { id, valor }
  const [novoItem, setNovoItem]       = useState(null);  // { busca, produto, apresentacaoId, localId, quantidade }
  const [confirmacao, setConfirmacao] = useState(null);
  /* Foco de volta no campo de produto depois de cada item adicionado — o
     mesmo cuidado que Movimentações tem depois de cada gravação. Montar um
     pedido de quinze linhas sem tirar a mão do teclado depende disto. */
  const buscaItemRef = useRef(null);
  const [salvando, setSalvando]       = useState(false);
  const [erroForm, setErroForm]       = useState(null);

  const { dados, carregando, erro, recarregar } = useCarregamento(async () => {
    const [cab, its] = await Promise.all([
      supabase.from('vw_requisicoes').select('*').eq('id', id).maybeSingle(),
      supabase.from('vw_requisicao_itens').select('*')
        .eq('requisicao_id', id)
        /* Ordem de criação, e não a da view (criado_em desc): aqui a leitura é
           o pedido de cima para baixo, na ordem em que foi montado. */
        .order('criado_em', { ascending: true }),
    ]);
    if (cab.error) throw cab.error;
    if (its.error) throw its.error;
    return { cabecalho: cab.data ?? null, itens: its.data ?? [] };
  }, [id], { cabecalho: null, itens: [] });

  const { cabecalho, itens } = dados;

  /* Só admin indica outra pessoa como responsável — o tg_protege_requisicao
     barra a troca para os demais, então nem carregamos a lista. */
  const { dados: usuarios } = useCarregamento(async () => {
    if (!isAdmin) return [];
    const { data, error } = await supabase
      .from('perfis').select('id, nome').eq('ativo', true).order('nome');
    if (error) throw error;
    return data ?? [];
  }, [isAdmin], []);

  /* O `estoques(local_id)` aninhado é o que permite oferecer só local que
     realmente estoca a embalagem. Vem na mesma consulta porque é a mesma
     pergunta: "o que dá para pedir deste produto, e de onde".

     O RLS de estoques é por local, então esta lista já chega recortada pelo
     que o usuário vê — e o cruzamento com locaisEditaveis, abaixo, reduz do
     "que vejo" para o "que gerencio". */
  const { dados: apresentacoes } = useCarregamento(async () => {
    if (!novoItem?.produto) return [];
    const { data, error } = await supabase
      .from('apresentacoes')
      .select('id, descricao, quantidade_unitaria, unidades(sigla), estoques(local_id)')
      .eq('produto_id', novoItem.produto.id)
      .order('descricao');
    if (error) throw error;
    return data ?? [];
  }, [novoItem?.produto?.id], []);

  const podeEditarLocal = (localId) =>
    isAdmin || locais.some(l => l.id === localId && l.pode_editar);

  /* O pode_editar do contexto já vem com o admin resolvido. */
  const locaisEditaveis = locais.filter(l => l.pode_editar);

  const podeEditarCab = podeEditarCabecalho({
    cabecalho, itens, isAdmin, userId: user?.id, podeEditarLocal,
  });

  /* Não adianta comparar com cabecalho.itens para descobrir se algo ficou
     escondido: a vw_requisicoes é security_invoker, então a contagem dela
     passa pelo mesmo RLS desta consulta e os dois números são sempre iguais.
     Lista vazia pode ser pedido vazio OU pedido inteiro em local alheio, e a
     tela não tem como distinguir — então diz os dois. */
  const semItensVisiveis = itens.length === 0;

  /* Contado da lista carregada, e não do cabecalho.itens_pendentes: são o
     mesmo número (a view é security_invoker, mesmo RLS), e tirar da lista
     mantém o que o botão afirma igual ao que a tabela mostra. */
  const itensPendentes = itens.filter(
    i => Number(i.quantidade_entregue) < Number(i.quantidade_solicitada),
  );
  const faltandoTotal = arred(itensPendentes.reduce(
    (t, i) => t + (Number(i.quantidade_solicitada) - Number(i.quantidade_entregue)), 0,
  ));
  const encerrada = Boolean(cabecalho?.fechada_em);

  const totalSolicitado = arred(itens.reduce((s, i) => s + Number(i.quantidade_solicitada), 0));
  const totalEntregue   = arred(itens.reduce((s, i) => s + Number(i.quantidade_entregue), 0));
  const temExcedente    = itens.some(i => Number(i.quantidade_entregue) > Number(i.quantidade_solicitada));

  /* ─────────── cabeçalho ─────────── */

  const abrirEdicaoCab = (focoObs = false) => {
    setErroForm(null);
    setEditCab({
      data:         dataHoraParaInput(cabecalho.data),
      observacoes:  cabecalho.observacoes ?? '',
      digitado_por: cabecalho.digitado_por ?? '',
      entregue_por: cabecalho.entregue_por ?? '',
      focoObs,
    });
  };

  const salvarCabecalho = async () => {
    if (!editCab.data) { setErroForm('Informe a data do pedido.'); return; }

    setSalvando(true); setErroForm(null);

    /* new Date(campo).toISOString(): o campo datetime-local entrega
       "AAAA-MM-DDTHH:MM" sem fuso, que o construtor lê como hora local — e o
       toISOString converte para UTC, que é o único uso legítimo dele. Ver o
       comentário do lib/datas.js. */
    const payload = {
      data:        new Date(editCab.data).toISOString(),
      observacoes: editCab.observacoes.trim() || null,
    };
    /* Os responsáveis só vão no payload para admin. Mandá-los iguais também
       passaria pelo trigger (ele compara com IS DISTINCT FROM), mas não
       mandar deixa claro, de quem lê o código, quem tem direito ao quê. */
    if (isAdmin) {
      payload.digitado_por = editCab.digitado_por;
      payload.entregue_por = editCab.entregue_por;
    }

    /* O update é na TABELA, não na view: vw_requisicoes é leitura, e é dela
       que vêm os nomes já resolvidos. O .select() existe porque o RLS recusa
       UPDATE em silêncio — sem ele o PostgREST devolve sucesso com zero
       linhas e a tela mentiria que salvou. */
    const { data, error } = await supabase
      .from('requisicoes').update(payload).eq('id', id).select('id');

    setSalvando(false);

    if (error) { setErroForm(traduzErro(error)); return; }
    if (!data || data.length === 0) {
      setErroForm('Nada foi salvo — você não tem permissão para editar esta requisição.');
      return;
    }

    setEditCab(null);
    toast.sucesso('Requisição atualizada.');
    recarregar();
  };

  /* fechada_em entra pela mesma policy de update do resto do cabeçalho, e o
     tg_protege_requisicao não a protege — ela não é auditoria nem responsável,
     é decisão revogável. O .select() pelo motivo de sempre: o RLS recusa
     UPDATE em silêncio. */
  const mudarFechamento = async (fechar) => {
    setSalvando(true); setErroForm(null);

    const { data, error } = await supabase
      .from('requisicoes')
      .update({ fechada_em: fechar ? new Date().toISOString() : null })
      .eq('id', id)
      .select('id');

    setSalvando(false);

    if (error) { setErroForm(traduzErro(error)); return; }
    if (!data || data.length === 0) {
      setErroForm('Nada mudou — você não tem permissão para encerrar esta requisição.');
      return;
    }

    toast.sucesso(fechar ? 'Requisição encerrada.' : 'Requisição reaberta.');
    recarregar();
  };

  const confirmarEncerrar = () => setConfirmacao({
    mensagem: mensagemEncerrar(cabecalho.id, itensPendentes.length, faltandoTotal),
    onConfirm: () => { setConfirmacao(null); mudarFechamento(true); },
  });

  const confirmarReabrir = () => setConfirmacao({
    mensagem: `Reabrir a requisição #${cabecalho.id}? Ela volta a valer como pedido em aberto`
      + (itensPendentes.length > 0
        ? ' e reaparece na lista de pendências.'
        : ' — e, como nada está pendente, vai aparecer como concluída.'),
    onConfirm: () => { setConfirmacao(null); mudarFechamento(false); },
  });

  /* ─────────── itens ─────────── */

  const salvarQuantidade = async () => {
    const valor = Number(editItem.valor);
    if (!editItem.valor || valor <= 0) {
      setErroForm('A quantidade solicitada precisa ser maior que zero.');
      return;
    }

    setSalvando(true); setErroForm(null);
    const { data, error } = await supabase
      .from('requisicao_itens')
      .update({ quantidade_solicitada: valor })
      .eq('id', editItem.id)
      .select('id');
    setSalvando(false);

    if (error) { setErroForm(traduzErro(error)); return; }
    if (!data || data.length === 0) {
      setErroForm('Nada foi salvo — você não gerencia o local deste item.');
      return;
    }

    setEditItem(null);
    recarregar();
  };

  const excluirItem = (i) => {
    setConfirmacao({
      mensagem: mensagemExclusaoItem(i),
      onConfirm: async () => {
        setConfirmacao(null); setErroForm(null);

        const { data, error } = await supabase
          .from('requisicao_itens').delete().eq('id', i.id).select('id');

        if (error) {
          /* O tg_protege_requisicao_item levanta 42501 com mensagem própria,
             em português, dizendo quantas entregas o item tem e qual é o
             caminho sem perda. O traduzErro deixa essa mensagem passar — só a
             recusa de policy, que vem em inglês, vira texto genérico. */
          setErroForm(traduzErro(error));
          return;
        }
        if (!data || data.length === 0) {
          setErroForm('Nada foi excluído — você não gerencia o local deste item.');
          return;
        }

        toast.sucesso('Item removido da requisição.');
        recarregar();
      },
    });
  };

  /* ─────────── novo item ─────────── */

  const abrirNovoItem = () => {
    setErroForm(null);
    setNovoItem({
      busca: '',
      produto: null,
      apresentacaoId: '',
      /* Começa pelo local da barra superior quando ele é editável: é o que a
         pessoa está olhando. Senão, pelo primeiro que ela gerencia. */
      localId: String(
        (localAtual && locaisEditaveis.some(l => l.id === localAtual.id) ? localAtual.id : null)
        ?? locaisEditaveis[0]?.id
        ?? '',
      ),
      quantidade: '',
    });
  };

  /* ─ O que dá para pedir, e de onde ─
     O local do item é o local de RETIRADA: é de lá que a embalagem sai. Pedir
     retirada de um local que nem estoca o produto é pedido impossível por
     construção — e o banco não barra, porque requisicao_itens aponta para
     apresentação e local sem passar por estoques. Então a tela barra.

     É o mesmo recorte que Movimentações faz quando diz "esta apresentação não
     está vinculada ao local X", só que aqui ele entra antes, escolhendo o que
     aparece, em vez de recusar depois de escolhido. */
  const locaisDaApresentacao = (ap) =>
    locaisEditaveis.filter(l => (ap.estoques ?? []).some(e => e.local_id === l.id));

  const apresentacoesPossiveis = apresentacoes.filter(a => locaisDaApresentacao(a).length > 0);
  /* Nunca cortar calado: sem este número, quem não acha a embalagem no select
     não tem como saber que ela existe e só não tem estoque aqui. Mesma lição
     do rodapé do combobox de produto. */
  const apresentacoesOcultas = apresentacoes.length - apresentacoesPossiveis.length;

  /* A escolha vale enquanto existir na lista atual — trocar de produto troca
     as apresentações, e o id antigo não pode continuar valendo. Derivado, e
     não corrigido por efeito, pelo mesmo motivo de Movimentações. */
  const apresentacaoId =
    apresentacoesPossiveis.some(a => String(a.id) === novoItem?.apresentacaoId)
      ? novoItem.apresentacaoId
      : (apresentacoesPossiveis[0] ? String(apresentacoesPossiveis[0].id) : '');

  const apEscolhida  = apresentacoesPossiveis.find(a => String(a.id) === apresentacaoId) ?? null;
  const locaisDoItem = apEscolhida ? locaisDaApresentacao(apEscolhida) : [];

  /* Derivado também: o local semeado na abertura do formulário (o da barra
     superior) pode não estocar a embalagem que a pessoa acabou de escolher. */
  const localId = locaisDoItem.some(l => String(l.id) === novoItem?.localId)
    ? novoItem.localId
    : (locaisDoItem[0] ? String(locaisDoItem[0].id) : '');

  const adicionarItem = async () => {
    if (!novoItem.produto)  { setErroForm('Escolha um produto.'); return; }
    if (!apresentacaoId)    {
      setErroForm('Nenhuma embalagem deste produto tem estoque em local que você gerencia.');
      return;
    }
    if (!localId)           { setErroForm('Escolha o local de retirada.'); return; }
    if (!novoItem.quantidade || Number(novoItem.quantidade) <= 0) {
      setErroForm('Informe quanto está sendo pedido.');
      return;
    }

    setSalvando(true); setErroForm(null);
    const { error } = await supabase.from('requisicao_itens').insert([{
      requisicao_id:         Number(id),
      apresentacao_id:       Number(apresentacaoId),
      local_id:              Number(localId),
      quantidade_solicitada: Number(novoItem.quantidade),
    }]);
    setSalvando(false);

    if (error) {
      /* 23505 aqui é o idx_requisicao_itens_unico, e a mensagem genérica do
         traduzErro ("já existe um registro com esse nome/sigla") não diz nada
         a quem está montando um pedido. O índice é (requisição, apresentação,
         local): o mesmo produto pode entrar de novo se for de outro local. */
      setErroForm(error.code === '23505'
        ? 'Este produto, nesta apresentação, já está na requisição para este local. Edite a quantidade da linha que já existe.'
        : traduzErro(error));
      return;
    }

    /* O formulário continua aberto, só limpo, porque montar pedido é repetir:
       fechar a cada item obrigaria a clicar em "Adicionar item" quinze vezes
       numa requisição de quinze linhas. O local é o único campo que sobrevive
       — é quase sempre o mesmo em todo o pedido. */
    setNovoItem(n => ({
      busca: '', produto: null, apresentacaoId: '', localId: n.localId, quantidade: '',
    }));
    toast.sucesso('Item adicionado ao pedido.');
    recarregar();
    buscaItemRef.current?.focus();
  };

  /* ─────────── render ─────────── */

  if (carregando) {
    return <div className="p-8 text-center text-app-text-secondary text-[13px]">Carregando...</div>;
  }

  /* Falha de carga não é ausência: dizer "não existe" depois de um erro de
     rede seria uma mentira com cara de certeza. */
  if (erro && !cabecalho) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-app-text-secondary">
        <AlertCircle size={32} className="text-rose-400" />
        <p className="text-[14px] font-semibold text-rose-600">{erro}</p>
        <button className="btn btn-secondary px-4 py-2" onClick={() => navigate('/requisicoes')}>
          Voltar às requisições
        </button>
      </div>
    );
  }

  if (!cabecalho) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-app-text-secondary">
        <FileStack size={32} className="text-app-text-label" />
        {/* Categórico porque pode ser: a policy de leitura do cabeçalho é só
            fn_is_ativo(), então todo usuário ativo vê todas as requisições.
            "Não aparece" aqui quer dizer mesmo "não existe". */}
        <p className="text-[14px] font-semibold">A requisição #{id} não existe.</p>
        <button className="btn btn-secondary px-4 py-2" onClick={() => navigate('/requisicoes')}>
          Voltar às requisições
        </button>
      </div>
    );
  }

  const situacao = situacaoDe(cabecalho);

  return (
    <div className="flex flex-col gap-5">

      {confirmacao && (
        <ConfirmDialog
          mensagem={confirmacao.mensagem}
          onConfirm={confirmacao.onConfirm}
          onCancel={() => setConfirmacao(null)}
        />
      )}

      <div>
        <Link
          to="/requisicoes"
          className="inline-flex items-center gap-1 text-[12px] text-app-text-secondary hover:text-app-text mb-2"
        >
          <ChevronLeft size={14} /> Requisições
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl mb-0">Requisição #{cabecalho.id}</h1>
          <SituacaoBadge situacao={situacao} />
        </div>
        <p className="text-[13px] text-app-text-secondary mt-0.5">
          Registrada em {formatarDataHora(cabecalho.criado_em)}
          {cabecalho.fechada_em && <> · encerrada em {formatarDataHora(cabecalho.fechada_em)}</>}
        </p>
      </div>

      {/* Com o formulário de item aberto o aviso desce para dentro dele: numa
          requisição longa o topo da página está fora da tela, e "Escolha um
          produto" lá em cima é o mesmo que não dizer nada. */}
      {erroForm && !novoItem && <Aviso texto={erroForm} />}

      {/* ─── Cabeçalho ─── */}
      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] font-bold text-app-text uppercase tracking-wide">Pedido</p>
          {podeEditarCab && !editCab && (
            <button className="btn btn-secondary px-3 py-1.5 text-[12px]" onClick={() => abrirEdicaoCab()}>
              <Pencil size={13} /> Editar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Data do pedido</Label>
            {editCab ? (
              <input
                type="datetime-local"
                value={editCab.data}
                onChange={e => setEditCab(c => ({ ...c, data: e.target.value }))}
                className="input-base"
              />
            ) : (
              <p className="text-[13px] text-app-text pt-[2px]">{formatarDataHora(cabecalho.data)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Digitou o pedido</Label>
            {editCab && isAdmin ? (
              <select
                value={editCab.digitado_por}
                onChange={e => setEditCab(c => ({ ...c, digitado_por: e.target.value }))}
                className="input-base"
              >
                {/* A lista traz só usuário ativo. Se quem digitou foi desativado
                    depois, sem esta opção o select abriria em branco e daria a
                    impressão de campo vazio — o valor continuaria certo no
                    estado, mas a tela estaria mentindo. */}
                {!usuarios.some(u => u.id === editCab.digitado_por) && (
                  <option value={editCab.digitado_por}>{cabecalho.digitado_por_nome ?? '—'} (inativo)</option>
                )}
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            ) : (
              <p className="text-[13px] text-app-text pt-[2px]">{cabecalho.digitado_por_nome ?? '—'}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Entregou</Label>
            {editCab && isAdmin ? (
              <select
                value={editCab.entregue_por}
                onChange={e => setEditCab(c => ({ ...c, entregue_por: e.target.value }))}
                className="input-base"
              >
                {!usuarios.some(u => u.id === editCab.entregue_por) && (
                  <option value={editCab.entregue_por}>{cabecalho.entregue_por_nome ?? '—'} (inativo)</option>
                )}
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            ) : (
              <p className="text-[13px] text-app-text pt-[2px]">{cabecalho.entregue_por_nome ?? '—'}</p>
            )}
          </div>
        </div>

        {/* A troca de responsável é de admin, e o trigger barra os outros no
            banco. Dizer isso aqui evita o usuário procurar o campo que não
            existe para ele. */}
        {editCab && !isAdmin && (
          <p className="text-[11px] text-app-text-label -mt-2">
            Só administradores trocam quem digitou ou entregou — é registro de quem fez, não
            um campo do pedido.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          {editCab ? (
            <textarea
              rows={3}
              autoFocus={editCab.focoObs}
              value={editCab.observacoes}
              onChange={e => setEditCab(c => ({ ...c, observacoes: e.target.value }))}
              placeholder="Por que foi entregue mais do que o pedido, o que ficou faltando, qualquer situação que mereça registro."
              className="input-base resize-y"
            />
          ) : cabecalho.observacoes ? (
            <p className="text-[13px] text-app-text whitespace-pre-wrap">{cabecalho.observacoes}</p>
          ) : (
            <p className="text-[13px] text-app-text-label">—</p>
          )}
        </div>

        {/* Entregar, encerrar e reabrir. Fora do modo de edição de propósito:
            são ações imediatas, e misturar com Salvar/Cancelar faria parecer que
            dependem de salvar o formulário.

            "Encerrar" desaparece quando não há nada pendente: o pedido já
            aparece como concluído, e encerrá-lo só trocaria um selo melhor por
            um pior. Requisição sem nenhum item continua encerrável — ela está
            aberta e ninguém vai atender. */}
        {!editCab && podeEditarCab && (
          <div className="flex flex-wrap gap-2 justify-end border-t border-app-border-inner pt-4">
            {/* Encerrada não oferece "Entregar": desde a migração 11 o banco
                recusa entrega em pedido encerrado, e mandar o usuário a
                Movimentações para tomar um erro lá seria desrespeito. O
                caminho está ao lado — Reabrir. */}
            {isAdmin && !encerrada && (
              <button
                className="btn btn-secondary px-4 py-2 text-[12px]"
                onClick={() => navigate(`/movimentacoes?requisicao=${cabecalho.id}`)}
                title="Abre Movimentações já vinculada a esta requisição"
              >
                <ArrowUpCircle size={14} /> Entregar
              </button>
            )}
            {podeEditarCab && (encerrada ? (
              <button
                className="btn btn-secondary px-4 py-2 text-[12px]"
                onClick={confirmarReabrir}
                disabled={salvando}
              >
                <Unlock size={14} /> Reabrir
              </button>
            ) : (itensPendentes.length > 0 || itens.length === 0) && (
              <button
                className="btn btn-secondary px-4 py-2 text-[12px]"
                onClick={confirmarEncerrar}
                disabled={salvando}
              >
                <Lock size={14} /> Encerrar
              </button>
            ))}
          </div>
        )}

        {editCab && (
          <div className="flex gap-2 justify-end border-t border-app-border-inner pt-4">
            <button
              className="btn btn-secondary px-4 py-2 text-[12px]"
              onClick={() => { setEditCab(null); setErroForm(null); }}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary px-4 py-2 text-[12px]"
              onClick={salvarCabecalho}
              disabled={salvando}
            >
              {salvando ? <Spinner /> : <Check size={14} />} Salvar
            </button>
          </div>
        )}
      </div>

      {/* ─── Itens ─── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-app-border-inner flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-app-text uppercase tracking-wide">Itens</p>
            <p className="text-[11px] text-app-text-secondary mt-0.5">
              o que foi pedido, quanto já saiu e o que falta
            </p>
          </div>
          {locaisEditaveis.length > 0 && !novoItem && !encerrada && (
            <button className="btn btn-primary px-3 py-1.5 text-[12px]" onClick={abrirNovoItem}>
              <Plus size={14} /> Adicionar item
            </button>
          )}
        </div>

        {/* O estado encerrado dito onde a ação aconteceria. A autoridade é o
            trigger da migração 11, não este aviso: uma aba aberta há meia hora
            não sabe que alguem encerrou o pedido do outro lado, e é por isso
            que o banco também recusa. */}
        {encerrada && (
          <div className="px-6 py-3 bg-violet-50 border-b border-violet-200 flex items-start gap-2 text-[12px] text-violet-900">
            <Lock size={14} className="shrink-0 mt-0.5" />
            <span>
              Pedido encerrado em {formatarDataHora(cabecalho.fechada_em)} — não aceita item
              novo nem entrega. {podeEditarCab
                ? 'Reabra, ali em cima, para voltar a mexer.'
                : 'Quem digitou o pedido, ou um administrador, pode reabrir.'}
            </span>
          </div>
        )}

        {/* 3.2: entregar mais do que o pedido avisa e deixa passar, porque
            bloquear faria o operador lançar a sobra sem requisição — e aí o
            vínculo se perde, que é pior que um número desconfortável. O lugar
            do porquê é a observação, e o aviso leva até ela. */}
        {temExcedente && (
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-[12px] text-amber-800">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">
              Algum item foi entregue acima do pedido. Não é erro — caixa fechada, troca de
              embalagem —, mas vale registrar o motivo nas observações.
            </span>
            {podeEditarCab && !editCab && (
              <button
                className="shrink-0 inline-flex items-center gap-1 font-semibold hover:underline underline-offset-2 cursor-pointer"
                onClick={() => abrirEdicaoCab(true)}
              >
                <MessageSquareText size={13} /> anotar
              </button>
            )}
          </div>
        )}

        <div className="table-wrapper border-none rounded-none">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Apresentação</th>
                <th>Local</th>
                <th className="text-right">Pedido</th>
                <th className="text-right">Entregue</th>
                <th className="text-right">Falta</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {semItensVisiveis ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-app-text-secondary text-[13px]">
                    Nenhum item seu nesta requisição — ou ela está vazia, ou os itens são de
                    locais que você não enxerga.
                    {locaisEditaveis.length > 0 && ' Use "Adicionar item" para montar o pedido.'}
                  </td>
                </tr>
              ) : (
                itens.map(i => {
                  const solicitada = Number(i.quantidade_solicitada);
                  const entregue   = Number(i.quantidade_entregue);
                  const falta      = arred(Math.max(0, solicitada - entregue));
                  const excedeu    = entregue > solicitada;
                  const editavel   = podeEditarLocal(i.local_id);
                  /* Item entregue só é excluível por admin — para os outros o
                     tg_protege_requisicao_item barra no banco, e desabilitar
                     aqui evita o clique que só traria o erro. O caminho sem
                     perda está no title: excluir a movimentação no Histórico
                     primeiro, que devolve o saldo pelo fn_reverte_estoque. */
                  const podeExcluir = editavel && (isAdmin || entregue === 0);
                  const emEdicao    = editItem?.id === i.id;

                  return (
                    <tr key={i.id}>
                      <td className="font-semibold">{i.produto}</td>
                      <td className="text-[12px] text-app-text-secondary">
                        {i.apresentacao}
                        <span className="text-app-text-label">
                          {' '}· {Number(i.quantidade_unitaria)} {i.unidade}
                        </span>
                      </td>
                      <td className="text-[12px] text-app-text-secondary">{i.local}</td>
                      <td className="text-right tabular-nums">
                        {emEdicao ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            autoFocus
                            value={editItem.valor}
                            onChange={e => setEditItem(it => ({ ...it, valor: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); salvarQuantidade(); }
                              if (e.key === 'Escape') { setEditItem(null); setErroForm(null); }
                            }}
                            className="input-base py-1 text-[12px] w-24 text-right"
                          />
                        ) : (
                          <span className="font-semibold">{solicitada}</span>
                        )}
                      </td>
                      <td className={`text-right tabular-nums font-semibold ${excedeu ? 'text-amber-600' : ''}`}>
                        {entregue}
                        {excedeu && (
                          <span className="ml-1 text-[11px] font-normal">
                            (+{arred(entregue - solicitada)})
                          </span>
                        )}
                      </td>
                      <td className="text-right tabular-nums">
                        {falta > 0
                          ? <span className="font-semibold text-sky-700">{falta}</span>
                          : <span className="text-app-text-label">—</span>}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {emEdicao ? (
                            <>
                              <button
                                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                onClick={salvarQuantidade}
                                disabled={salvando}
                                title="Salvar quantidade"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                className="p-1.5 rounded-md text-app-text-label hover:bg-app-bg cursor-pointer"
                                onClick={() => { setEditItem(null); setErroForm(null); }}
                                title="Cancelar"
                              >
                                <X size={15} />
                              </button>
                            </>
                          ) : editavel ? (
                            <>
                              <button
                                className="p-1.5 rounded-md text-app-text-label hover:text-app-text hover:bg-app-bg cursor-pointer"
                                onClick={() => { setEditItem({ id: i.id, valor: String(solicitada) }); setErroForm(null); }}
                                title="Corrigir a quantidade pedida"
                              >
                                <Pencil size={15} />
                              </button>
                              {/* O title mora no span, e não no botão: botão
                                  desabilitado não recebe evento de mouse em
                                  todo navegador, e a dica some justo no caso
                                  em que ela é a única explicação. */}
                              <span
                                className="inline-flex"
                                title={podeExcluir
                                  ? 'Excluir item'
                                  : 'Este item já tem entrega. Exclua a movimentação no Histórico primeiro — o saldo volta sozinho —, ou peça a um administrador.'}
                              >
                                <button
                                  className={`p-1.5 rounded-md ${podeExcluir
                                    ? 'text-rose-500 hover:bg-rose-50 cursor-pointer'
                                    : 'text-app-text-label opacity-40 cursor-not-allowed'}`}
                                  onClick={() => podeExcluir && excluirItem(i)}
                                  disabled={!podeExcluir}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-app-text-label" title="Você não gerencia este local">
                              leitura
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {!semItensVisiveis && (
              <tfoot>
                <tr className="border-t-2 border-app-border-inner">
                  <td colSpan={3} className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
                    Total{!isAdmin && ' — dos itens que você enxerga'}
                  </td>
                  <td className="text-right tabular-nums font-bold">{totalSolicitado}</td>
                  <td className="text-right tabular-nums font-bold">{totalEntregue}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* ─── Formulário de novo item ─── */}
        {novoItem && (
          <div className="border-t border-app-border-inner p-6 flex flex-col gap-4 bg-app-bg/40">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label required>Produto</Label>
                <ProdutoBusca
                  inputRef={buscaItemRef}
                  valor={novoItem.busca}
                  /* Funcional, e nao {...novoItem}: o ProdutoBusca dispara
                     onValorChange e onSelect no mesmo onChange, e duas copias do
                     mesmo estado antigo fariam a segunda apagar a primeira. */
                  onValorChange={v => setNovoItem(n => ({ ...n, busca: v }))}
                  onSelect={p => setNovoItem(n => ({ ...n, produto: p, apresentacaoId: '' }))}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label required>Apresentação</Label>
                <select
                  value={apresentacaoId}
                  onChange={e => setNovoItem(n => ({ ...n, apresentacaoId: e.target.value }))}
                  disabled={!novoItem.produto || apresentacoesPossiveis.length === 0}
                  className="input-base"
                >
                  {!novoItem.produto && <option value="">escolha o produto primeiro</option>}
                  {novoItem.produto && apresentacoesPossiveis.length === 0 && (
                    <option value="">nenhuma com estoque em local seu</option>
                  )}
                  {apresentacoesPossiveis.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.descricao} · {Number(a.quantidade_unitaria)} {a.unidades?.sigla}
                    </option>
                  ))}
                </select>
                {apresentacoesOcultas > 0 && (
                  <span className="text-[11px] text-amber-600">
                    {apresentacoesOcultas === 1
                      ? '1 embalagem deste produto não aparece'
                      : `${apresentacoesOcultas} embalagens deste produto não aparecem`}
                    : sem estoque em local que você gerencia.
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label required>Local de retirada</Label>
                <select
                  value={localId}
                  onChange={e => setNovoItem(n => ({ ...n, localId: e.target.value }))}
                  disabled={locaisDoItem.length === 0}
                  className="input-base"
                >
                  {locaisDoItem.length === 0 && (
                    <option value="">escolha a apresentação primeiro</option>
                  )}
                  {locaisDoItem.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
                {/* Duas regras somadas, e cada uma tem seu motivo: só local que
                    estoca a embalagem (daqui sai a retirada) e só local que o
                    usuário gerencia (3.6 — o RLS é o modelo de acesso, não um
                    detalhe de tela). Ser explícito evita a leitura de que o
                    sistema "perdeu" os outros locais. */}
                <span className="text-[11px] text-app-text-label">
                  Só locais que já estocam esta embalagem e que você gerencia — é de lá
                  que ela sai. Item de outro local é adicionado por quem o gerencia; a
                  requisição aceita os dois.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label required>Quantidade pedida</Label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={novoItem.quantidade}
                  onChange={e => setNovoItem(n => ({ ...n, quantidade: e.target.value }))}
                  /* Enter adiciona: o campo é o fim do caminho do teclado, e
                     este bloco não é um <form> — sem isto o Enter não faria
                     nada, que é o pior resultado possível para quem digita. */
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarItem(); } }}
                  placeholder="em embalagens"
                  className="input-base"
                />
              </div>
            </div>

            {/* Caminho de saída, em vez de beco: quem escolheu um produto que
                não está estocado em nenhum local seu precisa saber onde se
                vincula local a embalagem, que é a tela do produto. */}
            {novoItem.produto && apresentacoesPossiveis.length === 0 && (
              <p className="text-[12px] text-app-text-secondary">
                <span className="font-semibold">{novoItem.produto.nome}</span> não tem estoque
                em nenhum local que você gerencia, então não há de onde retirar.{' '}
                <Link
                  to={`/produtos/${novoItem.produto.id}`}
                  className="font-semibold text-sky-700 hover:underline underline-offset-2"
                >
                  Vincular um local a este produto
                </Link>{' '}
                — ou pedir a quem gerencia o local que tem o produto.
              </p>
            )}

            {erroForm && <Aviso texto={erroForm} />}

            <div className="flex gap-2 justify-end">
              <button
                className="btn btn-secondary px-4 py-2 text-[12px]"
                onClick={() => { setNovoItem(null); setErroForm(null); }}
                disabled={salvando}
              >
                Fechar
              </button>
              <button
                className="btn btn-primary px-4 py-2 text-[12px]"
                onClick={adicionarItem}
                disabled={salvando}
              >
                {salvando ? <Spinner /> : <Plus size={14} />} Adicionar
              </button>
            </div>
          </div>
        )}

        {locaisEditaveis.length === 0 && (
          <div className="px-6 py-3 border-t border-app-border-inner text-[11px] text-app-text-label">
            Você não gerencia nenhum local, então só pode acompanhar este pedido.
          </div>
        )}
      </div>

      {/* A baixa de estoque continua em Movimentações, e isso não é provisório:
          saldo, motivo, modo ajuste e o teclado inteiro moram lá, e uma segunda
          tela de entrega seria a mesma regra escrita duas vezes. */}
      <p className="text-[11px] text-app-text-label">
        {isAdmin
          ? 'A baixa em si acontece em Movimentações — "Entregar" abre aquela tela já vinculada a este número, com saldo do local, motivo e o combobox de produto.'
          : 'A entrega é lançada em Movimentações, e por enquanto só administradores fazem esse lançamento. Montar e corrigir o pedido é aqui.'}
      </p>
    </div>
  );
}
