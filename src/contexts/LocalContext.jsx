import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

const LocalContext = createContext({});
const STORAGE_KEY = 'app-estoque:local-atual';

/* Guarda o local (estoque) selecionado na barra superior.
   Persiste no localStorage para sobreviver ao refresh. */
export function LocalProvider({ children }) {
  const { user } = useAuth();
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
    const { data } = await supabase
      .from('locais')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome');
    const lista = data ?? [];
    setLocais(lista);

    // Restaura a seleção salva; se o local sumiu/foi desativado, cai no primeiro
    const salvo  = Number(localStorage.getItem(STORAGE_KEY));
    const achado = lista.find(l => l.id === salvo) ?? lista[0] ?? null;
    setLocalAtualState(achado);
    if (achado) localStorage.setItem(STORAGE_KEY, String(achado.id));
    setLoadingLocal(false);
  }, [user]);

  useEffect(() => { refreshLocais(); }, [refreshLocais]);

  const setLocalAtual = (id) => {
    const local = locais.find(l => l.id === Number(id)) ?? null;
    setLocalAtualState(local);
    if (local) localStorage.setItem(STORAGE_KEY, String(local.id));
  };

  return (
    <LocalContext.Provider value={{ locais, localAtual, setLocalAtual, loadingLocal, refreshLocais }}>
      {children}
    </LocalContext.Provider>
  );
}

export const useLocal = () => useContext(LocalContext);
