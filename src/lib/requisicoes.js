/* Situação da requisição — a regra, num lugar só.

   Derivada, e não guardada. Só o encerramento à mão é coluna (`fechada_em`),
   porque é decisão de alguém: informação nova, que soma nenhuma produz. O
   resto sai das contagens da `vw_requisicoes`, que se corrigem sozinhas
   quando uma movimentação é excluída. É a mesma razão de
   `quantidade_entregue` não ser coluna.

   Mora aqui, e não dentro da tela de lista, porque a tela da requisição
   precisa do mesmo veredito no cabeçalho. Duas cópias desta função é
   exatamente o tipo de divergência que ninguém percebe: a lista diria
   "Concluída" e o detalhe "Aberta" para a mesma linha.

   Arquivo .js e sem JSX de propósito — o selo que pinta isto na tela é o
   components/SituacaoBadge.jsx, separado para o hot reload não reclamar de
   arquivo que exporta componente e não-componente junto. */

export function situacaoDe(r) {
  if (r.fechada_em) return 'encerrada';
  if (Number(r.itens) > 0 && Number(r.itens_pendentes) === 0) return 'concluida';
  return 'aberta';
}

export const SITUACOES = {
  aberta:    { rotulo: 'Aberta',    classe: 'badge-sky' },
  concluida: { rotulo: 'Concluída', classe: 'badge-emerald' },
  encerrada: { rotulo: 'Encerrada', classe: 'badge-violet' },
};

/* O espelho de situacaoDe() no servidor, para o filtro da lista. Os dois
   precisam dizer a MESMA coisa, e por isso estão um ao lado do outro: se um
   mudar sozinho, a tela mostra "Aberta" numa linha que o filtro "Abertas" não
   traz, e o usuário não tem como adivinhar o porquê.

   A requisição sem nenhum item visível cai em "aberta" nos dois lados, e de
   propósito: ela não foi concluída coisa alguma — ou acabou de nascer, ou tem
   itens só em locais alheios. */
export function aplicarSituacao(query, situacao) {
  if (situacao === 'encerrada') {
    return query.not('fechada_em', 'is', null);
  }
  if (situacao === 'concluida') {
    return query.is('fechada_em', null).eq('itens_pendentes', 0).gt('itens', 0);
  }
  if (situacao === 'aberta') {
    return query.is('fechada_em', null).or('itens_pendentes.gt.0,itens.eq.0');
  }
  return query;
}
