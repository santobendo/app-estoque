import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { traduzErro } from './erros';

/* Carregamento de dados: uma consulta, um estado de espera, um erro.

   Era o idioma copiado em dez telas, sempre assim:

     const fetch = useCallback(async () => {
       setLoading(true);
       const { data } = await supabase.from('...').select();
       setRows(data ?? []);
       setLoading(false);
     }, []);
     useEffect(() => { fetch(); }, [fetch]);

   Isso gerava os treze erros de react-hooks/set-state-in-effect da dívida
   técnica. O erro é real, não pedantismo: o `setLoading(true)` roda de forma
   sincrona durante o efeito, o que obriga o React a renderizar duas vezes
   antes de pintar. Aqui o primeiro setState só acontece depois do `await`,
   fora do corpo do efeito, e a regra fica satisfeita sem desabilitar nada.

   Como usar:

     const { dados, carregando, erro, recarregar } = useCarregamento(
       async () => {
         const { data, error } = await supabase.from('x').select();
         if (error) throw error;          // o hook traduz e devolve em `erro`
         return data ?? [];
       },
       [localAtual?.id],                  // muda a dependência, recarrega
       [],                                // valor antes da primeira resposta
     );

   `recarregar()` é a saída para depois de gravar algo — o que as telas
   faziam chamando `fetch()` na mão.

   Duas decisões que não são óbvias:

   1. `useEffectEvent` guarda a função de carga. Sem isso ela entraria nas
      dependências do efeito e, por ser recriada a cada render, recarregaria
      em loop. A alternativa de sempre era pedir ao chamador um useCallback
      com a lista certa, ou desabilitar o exhaustive-deps — nenhuma das duas
      resiste a quem for mexer na tela seis meses depois.

   2. `carregando` é derivado, não é estado. Ele compara a marca do resultado
      que está na mão com a marca do pedido atual, onde a marca é a versão
      somada às dependências serializadas. Por isso ele volta a ser `true` no
      mesmo render em que a dependência muda, sem nenhum setState no efeito —
      que é justamente o que a regra proíbe. Se fosse estado, trocar de local
      mostraria por um instante as linhas do local anterior, que é pior que
      um spinner: é dado de outro lugar na tela. */
export function useCarregamento(carregar, deps = [], inicial = null) {
  const executar = useEffectEvent(carregar);

  const [versao, setVersao]       = useState(0);
  /* `inicial` entra no useState, que o lê uma vez só: a tela recebe sempre a
     mesma instância até a primeira resposta chegar. Isso importa mais do que
     parece — `dados ?? []` no chamador devolveria um array novo a cada render
     e faria todo useMemo que dependesse dele recalcular sem motivo. */
  const [resultado, setResultado] = useState({ marca: null, dados: inicial, erro: null });

  /* JSON.stringify e não a lista crua: as dependências aqui são ids, textos
     e booleanos, e comparar por valor faz o objeto `localAtual` recriado
     pelo provider não disparar recarga à toa. */
  const marca = `${versao}|${JSON.stringify(deps)}`;

  const recarregar = useCallback(() => setVersao(v => v + 1), []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const dados = await executar();
        if (vivo) setResultado({ marca, dados, erro: null });
      } catch (e) {
        /* Mantém os dados que já estavam na mão em vez de zerar: a tela que
           faz `const { rows } = dados` quebraria com null, e esvaziar a lista
           por causa de uma falha de rede apaga o que o usuário estava vendo.
           Quem quiser reagir ao erro lê o `erro` devolvido aqui. */
        if (vivo) setResultado(antes => ({ marca, dados: antes.dados, erro: traduzErro(e) }));
      }
    })();
    /* O StrictMode roda o efeito duas vezes em desenvolvimento, e a tela
       pode desmontar no meio da consulta: sem esta bandeira o setState cairia
       num componente que já saiu. */
    return () => { vivo = false; };
  }, [marca]);

  return {
    dados:      resultado.dados,
    erro:       resultado.erro,
    carregando: resultado.marca !== marca,
    recarregar,
  };
}
