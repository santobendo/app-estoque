import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, ArrowRightLeft, History,
  ShoppingCart, Settings, Box, LogOut, ClipboardList, FileText,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function Sidebar() {
  const { user, perfil, isAdmin, signOut } = useAuth();

  const navItems = [
    { name: 'Catálogo',          path: '/',               icon: <LayoutGrid size={18} /> },
    { name: 'Movimentações',     path: '/movimentacoes',  icon: <ArrowRightLeft size={18} /> },
    { name: 'Histórico',         path: '/historico',      icon: <History size={18} /> },
    { name: 'Sugestão de Compra',path: '/compras',        icon: <ShoppingCart size={18} /> },
    { name: 'Relatório de Estoque',path: '/relatorio-estoque', icon: <FileText size={18} /> },
    { name: 'Cadastros',         path: '/cadastros',      icon: <ClipboardList size={18} /> },
  ];

  const adminItems = [
    { name: 'Configurações', path: '/configuracoes', icon: <Settings size={18} /> },
  ];

  const userName    = perfil?.nome || user?.email?.split('@')[0] || 'Usuário';
  const userPapel   = perfil?.papeis?.nome ?? (isAdmin ? 'Administrador' : 'Usuário');
  const userInitial = userName.substring(0, 2).toUpperCase();

  return (
    <aside className="w-60 bg-white border-r border-app-border flex flex-col shrink-0 print:hidden">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-app-border-inner">
        <Box className="text-app-text mr-2 shrink-0" size={20} />
        <span className="font-bold text-[15px] tracking-tight">Estoque</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 flex flex-col gap-0.5">
        <div className="text-[10px] font-bold text-app-text-label uppercase tracking-widest px-2 mb-2">
          Menu
        </div>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-100 text-[13px] font-medium ${
                isActive
                  ? 'bg-app-bg text-app-text font-semibold'
                  : 'text-app-text-secondary hover:bg-app-bg/60 hover:text-app-text'
              }`
            }
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="text-[10px] font-bold text-app-text-label uppercase tracking-widest px-2 mt-5 mb-2">
              Administração
            </div>
            {adminItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-100 text-[13px] font-medium ${
                    isActive
                      ? 'bg-app-bg text-app-text font-semibold'
                      : 'text-app-text-secondary hover:bg-app-bg/60 hover:text-app-text'
                  }`
                }
              >
                {item.icon}
                {item.name}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-app-border-inner">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-app-bg flex items-center justify-center font-bold text-app-text text-[12px] shrink-0">
            {userInitial}
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-[12px] font-bold text-app-text truncate">{userName}</span>
            <span className="text-[10px] text-app-text-secondary truncate">{userPapel}</span>
          </div>
          <button
            onClick={signOut}
            title="Sair"
            className="text-app-text-label hover:text-rose-500 transition-colors p-1 shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
