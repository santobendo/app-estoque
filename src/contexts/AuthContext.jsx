import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [session, setSession] = useState(null);
  const [perfil, setPerfil]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Busca perfil de forma independente — nunca bloqueia o carregamento
  const fetchPerfil = async (userId) => {
    if (!userId) {
      setPerfil(null);
      return;
    }
    try {
      const { data } = await supabase
        .from('perfis')
        .select('id, nome, is_admin, ativo, papel_id, papeis(nome)')
        .eq('id', userId)
        .single();
      setPerfil(data ?? null);
    } catch {
      setPerfil(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Sessão inicial
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        fetchPerfil(session?.user?.id ?? null);
      })
      .catch((err) => {
        console.error("Erro ao recuperar sessao:", err);
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    // Escuta mudanças de auth (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        fetchPerfil(session?.user?.id ?? null);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = {
    session,
    user,
    perfil,
    isAdmin: perfil?.is_admin === true,
    signOut: () => supabase.auth.signOut(),
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
