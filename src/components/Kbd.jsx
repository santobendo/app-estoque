import React from 'react';

/* Tecla desenhada, para as dicas de navegação dos painéis de busca.
   Vive aqui porque duas telas usam (cadastro de produto e movimentações) e
   nenhuma delas é dona do componente. */
export default function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 mr-0.5 rounded border border-app-border bg-white font-sans text-[9px] font-bold text-app-text-secondary">
      {children}
    </kbd>
  );
}
