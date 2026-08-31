import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { CheckCircle, AlertCircle, TriangleAlert, Info, X } from 'lucide-react';
import { ToastContext } from '../lib/toast';

const DURACAO = 3000;   // tempo visível antes de começar a sair
const SAIDA   = 220;    // duração da animação de saída (casa com o index.css)
const MAX     = 5;      // empilhados ao mesmo tempo

/* Borda esquerda colorida é o vocabulário que a tela de movimentações já
   usava no antigo banner de sucesso — o toast só mudou de lugar. */
const ESTILOS = {
  sucesso: { Icone: CheckCircle,   cor: 'text-emerald-500', borda: 'border-l-emerald-500' },
  erro:    { Icone: AlertCircle,   cor: 'text-rose-500',    borda: 'border-l-rose-500' },
  aviso:   { Icone: TriangleAlert, cor: 'text-amber-500',   borda: 'border-l-amber-500' },
  info:    { Icone: Info,          cor: 'text-sky-500',     borda: 'border-l-sky-500' },
};

let seq = 0;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  /* timers: um por toast, sempre sob a mesma chave, para que reagendar
     cancele o anterior. ordem: ids que ainda não começaram a sair, na
     ordem de chegada — é o que decide quem cede lugar ao estourar o MAX. */
  const timers = useRef(new Map());
  const ordem  = useRef([]);

  const iniciarSaida = useCallback((id) => {
    ordem.current = ordem.current.filter(x => x !== id);
    clearTimeout(timers.current.get(id));
    setToasts(ts => ts.map(t => (t.id === id ? { ...t, saindo: true } : t)));
    timers.current.set(id, setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id));
      timers.current.delete(id);
    }, SAIDA));
  }, []);

  const adicionar = useCallback((tipo, mensagem) => {
    if (!mensagem) return null;
    const id = ++seq;
    ordem.current = [...ordem.current, id];
    setToasts(ts => [...ts, { id, tipo, mensagem, saindo: false }]);
    timers.current.set(id, setTimeout(() => iniciarSaida(id), DURACAO));

    /* Estourou o limite: o mais antigo sai animado, como se o tempo dele
       tivesse acabado — em vez de desaparecer de um quadro para o outro. */
    while (ordem.current.length > MAX) iniciarSaida(ordem.current[0]);

    return id;
  }, [iniciarSaida]);

  /* Sem isto, sair da página com um toast na tela deixa um setState
     agendado para um componente já desmontado. */
  useEffect(() => {
    const mapa = timers.current;
    return () => { mapa.forEach(clearTimeout); mapa.clear(); };
  }, []);

  const api = useMemo(() => ({
    sucesso: (m) => adicionar('sucesso', m),
    erro:    (m) => adicionar('erro', m),
    aviso:   (m) => adicionar('aviso', m),
    info:    (m) => adicionar('info', m),
    fechar:  iniciarSaida,
  }), [adicionar, iniciarSaida]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* aria-live="polite": o leitor de tela anuncia quando terminar o que
          está lendo, sem interromper. O container não captura clique; só os
          cartões, senão ele bloquearia a coluna inteira da tela. */}
      <div
        role="status"
        aria-live="polite"
        className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))] pointer-events-none print:hidden"
      >
        {toasts.map(t => {
          const { Icone, cor, borda } = ESTILOS[t.tipo] ?? ESTILOS.info;
          return (
            <div
              key={t.id}
              data-saindo={t.saindo}
              className={`toast-item pointer-events-auto card border-l-4 ${borda} flex items-start gap-3 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.14)]`}
            >
              <Icone size={16} className={`${cor} shrink-0 mt-px`} />
              <span className="flex-1 text-[13px] text-app-text leading-snug">
                {t.mensagem}
              </span>
              <button
                type="button"
                onClick={() => iniciarSaida(t.id)}
                aria-label="Fechar notificação"
                className="text-app-text-label hover:text-app-text transition-colors shrink-0 mt-px"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
