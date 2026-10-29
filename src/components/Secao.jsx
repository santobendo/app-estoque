import React from 'react';

/* Cabeçalho numerado e rótulo de campo dos formulários em seções.
   Vivem aqui pelo mesmo motivo do Kbd: várias telas usam e nenhuma é dona
   deles. Eram cópias locais em Movimentações, Requisição, CadastroProduto e
   ProdutoDetalhe — e já tinham divergido: a cópia do CadastroProduto não
   aceitava `subtitle` e a do ProdutoDetalhe não aceitava `required`, então
   quem passasse essas props ali descobriria que não funcionavam. É o custo
   real de componente duplicado: não é a repetição, é a divergência calada. */

export function Label({ children, required }) {
  return (
    <label className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">
      {children}{required && <span className="text-rose-500 ml-0.5">*</span>}
    </label>
  );
}

export function SectionHeader({ number, title, subtitle }) {
  return (
    <div className="px-6 py-4 border-b border-app-border-inner flex items-center gap-3">
      <span className="w-6 h-6 rounded-full bg-app-text text-white flex items-center justify-center text-[11px] font-bold shrink-0">
        {number}
      </span>
      <span className="text-[13px] font-bold text-app-text uppercase tracking-wide">{title}</span>
      {subtitle && <span className="text-[11px] text-app-text-secondary">{subtitle}</span>}
    </div>
  );
}
