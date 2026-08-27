import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const LocalContext = createContext({});
const STORAGE_KEY = 'app-estoque:local-atual';

/* Guarda o local (estoque) selecionado na barra superior.
   Persiste no localStorage para sobreviver ao refresh. */
export function LocalProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [locais, setLocais]               = useState([]);
  const [localAtual, setLocalAtualState]  = useState(null);
  const [loadingLocal, setLoadingLocal]   = useState(true);

  const refreshLocais = useCallback(async () => {
    if (!user) {
      setLocais([]);
      setLocalAtualState(null);
      setLoadingLocal(false);
      return;
    }
    setLoadingLocal(true);

    /* A consulta a "locais" não filtra por permissão: o RLS já devolve só os
       locais concedidos. O que ela não diz é se o acesso é de leitura ou de
       gestão — daí a segunda consulta, que traz o pode_editar de cada um. */
    const [{ data: locs }, { data: acessos }] = await Promise.all([
      supabase
        .from('locais')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome'),
      supabase
        .from('usuarios_locais')
        .select('local_id, pode_editar')
        .eq('usuario_id', user.id),
    ]);

    /* Admin não tem linha em usuarios_locais — fn_is_admin() concede tudo no
       banco. Sem este short-circuit ele apareceria como somente leitura. */
    const mapa = new Map((acessos ?? []).map(a => [a.local_id, a.pode_editar]));
    const lista = (locs ?? []).map(l => ({
      ...l,
      pode_editar: isAdmin || mapa.get(l.id) === true,
    }));
    setLocais(lista);

    // Restaura a seleção salva; se o local sumiu/foi desativado, cai no primeiro
    const salvo  = Number(localStorage.getItem(STORAGE_KEY));
    const achado = lista.find(l => l.id === salvo) ?? lista[0] ?? null;
    setLocalAtualState(achado);
    if (achado) localStorage.setItem(STORAGE_KEY, String(achado.id));
    setLoadingLocal(false);
  }, [user, isAdmin]);

  useEffect(() => { refreshLocais(); }, [refreshLocais]);

  const setLocalAtual = (id) => {
    const local = locais.find(l => l.id === Number(id)) ?? null;
    setLocalAtualState(local);
    if (local) localStorage.setItem(STORAGE_KEY, String(local.id));
  };

  /* Atalhos para as telas não repetirem a mesma checagem:
     - podeEditarAtual  → libera os controles de escrita. Vale inclusive nas
                          telas globais (cadastro de produto, detalhe): o banco
                          aceitaria por fn_pode_editar_algum_local(), mas quem
                          está com um local em leitura na barra não espera que
                          o cadastro caia em outro estoque.
     - podeEditarAlgum  → só para diferenciar "não gerencia nada" de "gerencia,
                          mas não este local" nas mensagens de bloqueio.
     São conveniência de interface, não segurança: quem decide é o RLS. */
  const podeEditarAtual = localAtual?.pode_editar === true;
  const podeEditarAlgum = locais.some(l => l.pode_editar);

  return (
    <LocalContext.Provider value={{
      locais, localAtual, setLocalAtual, loadingLocal, refreshLocais,
      podeEditarAtual, podeEditarAlgum,
    }}>
      {children}
    </LocalContext.Provider>
  );
}

export const useLocal = () => useContext(LocalContext);
