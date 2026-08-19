import React from 'react';
import { Outlet } from 'react-router-dom';
import { UserX } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useAuth } from '../contexts/AuthContext';

function MainLayout() {
  const { perfil, signOut } = useAuth();

  // Usuário desativado: bloqueia o app inteiro (o RLS já impede escritas,
  // mas sem isso a pessoa navegaria sem entender por que nada funciona).
  if (perfil?.ativo === false) {
    return (
      <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center gap-4 p-4">
        <div className="w-14 h-14 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center">
          <UserX size={26} className="text-rose-500" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-bold text-app-text mb-1">Conta desativada</p>
          <p className="text-[13px] text-app-text-secondary">
            Sua conta foi desativada por um administrador. Fale com ele para reativar o acesso.
          </p>
        </div>
        <button className="btn btn-secondary px-5 py-2.5" onClick={signOut}>Sair</button>
      </div>
    );
  }

  return (
    // As variantes print: soltam altura/scroll do layout — sem isso a
    // impressão para na primeira página (h-screen + overflow recortam o resto).
    <div className="flex h-screen bg-app-bg text-app-text font-sans overflow-hidden print:block print:h-auto print:overflow-visible">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden print:block print:overflow-visible">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-8 print:overflow-visible print:p-0">
          <div className="max-w-6xl mx-auto print:max-w-none">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
