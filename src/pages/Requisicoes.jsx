import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ChevronLeft, ChevronRight, MessageSquareText } from 'lucide-react';
import { useCarregamento } from '../lib/useCarregamento';
import { inicioDoDiaISO, fimDoDiaISO, formatarDataHora } from '../lib/datas';
import { situacaoDe, aplicarSituacao } from '../lib/requisicoes';
import SituacaoBadge from '../components/SituacaoBadge';

const PAGE_SIZE = 20;

/* ─── Lista de requisições ───
   A primeira tela dedicada: até agora as requisições só eram alcançáveis pelo
   modal de "requisição existente", dentro de Movimentações, que mostra as 50
   mais recentes e serve para escolher uma, não para olhar o conjunto.

   Esta tela NÃO filtra pelo local da barra superior, ao contrário do Histórico.
   O cabeçalho da requisição não tem local — ela cruza locais por desenho, e a
   policy de leitura dele é só `fn_is_ativo()`. O que o acesso do usuário
   limita são os ITENS: `itens`, `itens_pendentes` e as somas vêm de
   subconsultas dentro de uma view `security_invoker`, então contam apenas os
   itens dos locais que ele enxerga. É por isso que o gerente de um local pode
   ver uma requisição com "0 itens": ela existe e é de outra pessoa, mas não
   tem nada que seja dele. O subtítulo diz isso em voz alta. */

/* Progresso em ITENS, não em quantidade. A soma das quantidades existe na view
   (total_solicitado e total_entregue) e vai no title, mas não serve de barra:
   ela soma embalagens de produtos diferentes, então 14 de 16 pode ser um saco
   de arroz e quinze sachês. "5 de 8 itens" é o que a pessoa precisa saber para
   decidir se volta a esta requisição. */
function Progresso({ r }) {
  const itens     = Number(r.itens);
  const pendentes = Number(r.itens_pendentes);

  if (itens === 0) {
    return <span className="text-[12px] text-app-text-label">sem itens seus</span>;
  }

  const prontos = itens - pendentes;
  const pct     = Math.round((prontos / itens) * 100);

  return (
    <div
      className="flex items-center gap-2 min-w-28"
      title={`${Number(r.total_entregue)} de ${Number(r.total_solicitado)} embalagens entregues`}
    >
      <div className="h-1.5 flex-1 rounded-full bg-app-bg overflow-hidden">
        <div
          className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-app-text-secondary whitespace-nowrap tabular-nums">
        {prontos}/{itens}
      </span>
    </div>
  );
}

export default function Requisicoes() {
  /* filtros */
  const [filtroSituacao, setFiltroSituacao] = useState('');
  /* Número da requisição: texto com dígitos filtrados na entrada, igual ao
     filtro Req do Histórico. É um id, não uma quantidade — setinha de
     incrementar e vírgula decimal não fazem sentido. */
  const [filtroNum, setFiltroNum]       = useState('');
  const [filtroInicio, setFiltroInicio] = useState('');
  const [filtroFim, setFiltroFim]       = useState('');

  /* Paginação derivada da chave dos filtros, como no Histórico: muda o filtro,
     a página volta a zero sem nenhum setState dentro de efeito. O botão Limpar
     zera à mão, porque derivar sozinho devolveria a página antiga quando a
     chave voltasse a um valor já visitado. */
  const chaveFiltros = [filtroSituacao, filtroNum, filtroInicio, filtroFim].join('|');
  const [paginado, setPaginado] = useState({ chave: null, valor: 0 });
  const pagina = paginado.chave === chaveFiltros ? paginado.valor : 0;
  const irParaPagina = (valor) => setPaginado({ chave: chaveFiltros, valor });
  const esquecerPagina = () => setPaginado({ chave: null, valor: 0 });

  const { dados, carregando, erro } = useCarregamento(async () => {
    let query = supabase
      .from('vw_requisicoes')
      .select(
        'id, data, fechada_em, observacoes, itens, itens_pendentes, '
        + 'total_solicitado, total_entregue, digitado_por_nome, entregue_por_nome',
        { count: 'exact' },
      )
      /* Ordena por data, e não pelo atualizado_em da view: atualizado_em existe
         para o modal de requisição existente, que quer o que foi mexido por
         último. Aqui a pergunta é outra — quando o pedido foi feito. */
      .order('data', { ascending: false })
      .order('id', { ascending: false })
      .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1);

    query = aplicarSituacao(query, filtroSituacao);

    if (filtroNum)    query = query.eq('id', Number(filtroNum));
    if (filtroInicio) query = query.gte('data', inicioDoDiaISO(filtroInicio));
    if (filtroFim)    query = query.lte('data', fimDoDiaISO(filtroFim));

    const { data, count, error } = await query;
    if (error) throw error;
    return { rows: data ?? [], total: count ?? 0 };
  }, [pagina, chaveFiltros], { rows: [], total: 0 });

  const { rows, total } = dados;
  const totalPaginas = Math.ceil(total / PAGE_SIZE);
  const temFiltro = filtroSituacao || filtroNum || filtroInicio || filtroFim;

  return (
    <div className="flex flex-col gap-5">

      <header>
        <h1 className="text-2xl mb-0.5">Requisições</h1>
        <p className="text-[13px] text-app-text-secondary">
          Todos os pedidos, de todos os locais — uma requisição cruza locais por desenho,
          então esta lista não segue o local da barra superior. O seu acesso limita os{' '}
          <span className="font-semibold text-app-text">itens</span>: as contagens e o
          progresso contam só os itens dos locais que você enxerga.
        </p>
      </header>

      {/* Filtros */}
      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">
            Situação
          </label>
          <select
            value={filtroSituacao}
            onChange={e => setFiltroSituacao(e.target.value)}
            className="input-base py-2 text-[12px]"
          >
            <option value="">Todas</option>
            <option value="aberta">Abertas</option>
            <option value="concluida">Concluídas</option>
            <option value="encerrada">Encerradas à mão</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">Nº</label>
          <input
            type="text"
            inputMode="numeric"
            value={filtroNum}
            onChange={e => setFiltroNum(e.target.value.replace(/\D/g, ''))}
            placeholder="nº"
            className="input-base py-2 text-[12px] w-20"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">De</label>
          <input
            type="date"
            value={filtroInicio}
            onChange={e => setFiltroInicio(e.target.value)}
            className="input-base py-2 text-[12px]"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-app-text-label uppercase tracking-widest">Até</label>
          <input
            type="date"
            value={filtroFim}
            onChange={e => setFiltroFim(e.target.value)}
            className="input-base py-2 text-[12px]"
          />
        </div>

        {temFiltro && (
          <button
            className="btn btn-secondary text-[12px] py-2 self-end"
            onClick={() => {
              setFiltroSituacao(''); setFiltroNum('');
              setFiltroInicio(''); setFiltroFim('');
              esquecerPagina();
            }}
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
                <th className="w-16">Nº</th>
                <th>Data</th>
                <th>Situação</th>
                <th className="w-40">Progresso</th>
                <th>Digitado por</th>
                <th>Entregue por</th>
                <th className="w-10 text-center">Obs</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-app-text-secondary text-[13px]">
                    Carregando...
                  </td>
                </tr>
              ) : erro ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-rose-600 text-[13px]">
                    {erro}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-app-text-secondary text-[13px]">
                    {/* Com filtro por número a mensagem pode ser categórica: o
                        cabeçalho da requisição é legível por qualquer usuário
                        ativo, então "não aparece" aqui quer dizer mesmo "não
                        existe" — diferente do Histórico, onde o recorte por
                        local deixa a dúvida no ar. */}
                    {filtroNum
                      ? <>A requisição <span className="font-semibold">#{filtroNum}</span> não existe.</>
                      : temFiltro
                        ? 'Nenhuma requisição com esses filtros.'
                        : 'Nenhuma requisição registrada ainda. Elas nascem na tela de Movimentações, ao lançar uma saída com requisição.'}
                  </td>
                </tr>
              ) : (
                rows.map(r => {
                  const situacao = situacaoDe(r);
                  return (
                    <tr key={r.id}>
                      <td className="font-bold tabular-nums">
                        <Link
                          to={`/requisicoes/${r.id}`}
                          className="hover:underline underline-offset-2"
                        >
                          #{r.id}
                        </Link>
                      </td>
                      <td className="text-[12px] whitespace-nowrap">{formatarDataHora(r.data)}</td>
                      <td><SituacaoBadge situacao={situacao} /></td>
                      <td><Progresso r={r} /></td>
                      <td className="text-[12px] text-app-text-secondary">{r.digitado_por_nome ?? '—'}</td>
                      <td className="text-[12px] text-app-text-secondary">{r.entregue_por_nome ?? '—'}</td>
                      <td className="text-center">
                        {/* O title vai no <span>, e nao no icone: o atributo
                            title num <svg> nao vira tooltip no navegador —
                            SVG quer um elemento <title> filho. O texto inteiro
                            da observacao aparece na tela da requisicao. */}
                        {r.observacoes
                          ? (
                            <span title={r.observacoes} className="inline-flex">
                              <MessageSquareText size={14} className="text-app-text-label" />
                            </span>
                          )
                          : <span className="text-app-text-label text-[12px]">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPaginas > 1 && (
          <div className="px-4 py-3 border-t border-app-border-inner flex items-center justify-between">
            <span className="text-[12px] text-app-text-secondary">
              {total} requisi{total !== 1 ? 'ções' : 'ção'} — página {pagina + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary py-1.5 px-3 text-[12px]"
                disabled={pagina === 0}
                onClick={() => irParaPagina(pagina - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                className="btn btn-secondary py-1.5 px-3 text-[12px]"
                disabled={pagina >= totalPaginas - 1}
                onClick={() => irParaPagina(pagina + 1)}
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
