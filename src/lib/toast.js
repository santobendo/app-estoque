import { createContext, useContext } from 'react';

/* Contexto e hook moram aqui, separados do ToastProvider, para que o arquivo
   do componente exporte só componentes — é o que o hot reload do Vite espera
   (ver react-refresh/only-export-components no DIVIDA_TECNICA.md). */
export const ToastContext = createContext(null);

/* toast.sucesso('Movimentação registrada!')
   toast.erro('Não foi possível salvar.')
   toast.aviso(...) · toast.info(...)

   Fora de um ToastProvider vira no-op em vez de quebrar a tela: uma
   notificação que não aparece é ruim, uma tela em branco é pior. */
const VAZIO = {
  sucesso: () => {},
  erro:    () => {},
  aviso:   () => {},
  info:    () => {},
  fechar:  () => {},
};

export function useToast() {
  return useContext(ToastContext) ?? VAZIO;
}
