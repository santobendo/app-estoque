import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGrid, ArrowRightLeft, Settings, Users, Box, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function Sidebar() {
  const { user, signOut } = useAuth();
  
  const navItems = [
    { name: 'Catálogo', path: '/', icon: <LayoutGrid size={20} /> },
    { name: 'Movimentações', path: '/movimentacoes', icon: <ArrowRightLeft size={20} /> },
    { name: 'Fornecedores', path: '/fornecedores', icon: <Users size={20} /> },
    { name: 'Configurações', path: '/configuracoes', icon: <Settings size={20} /> },
  ];

  const userInitial = user?.email ? user.email.substring(0, 2).toUpperCase() : 'US';
  const userName = user?.user_metadata?.nome || user?.email?.split('@')[0] || 'Usuário';

  return (
    <aside className="w-64 bg-app-card border-r border-app-border flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-app-border-inner">
        <Box className="text-app-text mr-2" size={24} />
        <span className="font-bold text-lg tracking-tight">Estoque</span>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-1">
        <div className="text-[11px] font-bold text-app-text-label uppercase tracking-widest px-2 mb-3">Menu</div>
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                isActive 
                  ? 'text-app-text font-bold bg-app-bg' 
                  : 'text-app-text-secondary hover:bg-app-bg/50 font-medium'
              }`
            }
          >
            {item.icon}
            <span className="text-[13px]">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-app-border-inner">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3 flex-1 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-app-bg flex items-center justify-center font-bold text-app-text text-sm shrink-0">
              {userInitial}
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-[13px] font-bold text-app-text truncate">{userName}</span>
              <span className="text-[11px] text-app-text-secondary truncate">Usuário</span>
            </div>
          </div>
          <button 
            onClick={signOut}
            title="Sair"
            className="text-app-text-secondary hover:text-red-500 transition-colors p-1"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
