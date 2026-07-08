import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { Box, Lock, Mail } from 'lucide-react';

function traduzErroLogin(error) {
  const msg = error.message?.toLowerCase() ?? '';
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed'))       return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (msg.includes('user is banned') || msg.includes('banned')) return 'Esta conta está bloqueada. Fale com o administrador.';
  if (msg.includes('rate limit') || msg.includes('too many'))   return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Falha de conexão. Verifique sua internet.';
  return error.message;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true });
    }
  }, [session, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(traduzErroLogin(error));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-[16px] shadow-[0_24px_64px_rgba(0,0,0,0.08)] p-8 border border-app-border">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-app-text rounded-xl flex items-center justify-center mb-4">
            <Box className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-app-text">Controle de Estoque</h1>
          <p className="text-sm text-app-text-secondary mt-1">Faça login para gerenciar os produtos</p>
        </div>

        {errorMsg && (
          <div className="mb-6 bg-red-50 text-red-600 text-[13px] font-medium p-3 rounded-lg border border-red-200">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-app-text-label uppercase tracking-wider">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-base w-full pl-10"
                placeholder="seu@email.com"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-bold text-app-text-label uppercase tracking-wider">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-app-text-label" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-base w-full pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full py-2.5 mt-2 text-sm"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
