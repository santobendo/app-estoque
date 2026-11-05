import React from 'react';

/* Cartão de escolha única: um ícone, um título, uma descrição, e a borda
   acendendo quando está ativo. Era local da SecaoRequisicao, e saiu de lá
   quando a tela de Preferências passou a precisar do mesmo cartão — não por
   economia de linhas, mas porque a preferência tem que parecer exatamente a
   coisa que ela configura. Se fossem duas cópias, a divergência apareceria no
   dia em que uma ganhasse um estado e a outra não (ver o comentário do
   Secao.jsx, que é a mesma história já vivida).

   `icone: Icone` em vez de `icone` e um `const Icone = icone` no corpo: o JSX
   só aceita componente com inicial maiúscula, e renomear na desestruturação
   resolve em um lugar. */
export default function CartaoOpcao({ ativo, onClick, icone: Icone, titulo, descricao, cor }) {
  const paleta = {
    indigo:  ativo ? 'border-indigo-400 bg-indigo-50 text-indigo-700'   : 'border-app-border hover:border-indigo-200 text-app-text-secondary',
    sky:     ativo ? 'border-sky-400 bg-sky-50 text-sky-700'            : 'border-app-border hover:border-sky-200 text-app-text-secondary',
    neutro:  ativo ? 'border-app-text bg-app-bg text-app-text'          : 'border-app-border hover:border-app-text-label text-app-text-secondary',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`flex items-center gap-3 p-4 rounded-xl border-[1.5px] transition-all cursor-pointer ${paleta[cor]}`}
    >
      <Icone size={22} className="shrink-0" />
      <div className="text-left">
        <p className="text-[13px] font-bold">{titulo}</p>
        <p className="text-[11px] opacity-75">{descricao}</p>
      </div>
    </button>
  );
}
