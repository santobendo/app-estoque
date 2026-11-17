import React from 'react';
import { SITUACOES } from '../lib/requisicoes';

/* O selo de situação da requisição, usado na lista e no cabeçalho da tela da
   requisição. Só a pintura mora aqui; quem decide qual é a situação é o
   situacaoDe() do lib/requisicoes.js. */
export default function SituacaoBadge({ situacao, className = '' }) {
  const s = SITUACOES[situacao];
  if (!s) return null;

  return (
    <span className={`badge ${s.classe} w-fit px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${className}`}>
      {s.rotulo}
    </span>
  );
}
