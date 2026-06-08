import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowDownToLine,
  ArrowUpFromLine,
  Settings2,
  ShoppingCart,
  History,
  Menu,
  X,
  PlusCircle,
  Printer,
} from 'lucide-react';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { path: '/', icon: <LayoutDashboard size={22} />, label: 'Catálogo' },
    { path: '/cadastro', icon: <PlusCircle size={22} />, label: 'Novo Produto' },
    { path: '/entradas', icon: <ArrowDownToLine size={22} />, label: 'Entradas' },
    { path: '/saidas', icon: <ArrowUpFromLine size={22} />, label: 'Saídas' },
    { path: '/ajustes', icon: <Settings2 size={22} />, label: 'Ajustes' },
    { path: '/compras', icon: <ShoppingCart size={22} />, label: 'Compras' },
    { path: '/historico', icon: <History size={22} />, label: 'Histórico' },
    { path: '/relatorio', icon: <Printer size={22} />, label: 'Relatório' },
  ];

  return (
    <aside className={`glass-panel flex-shrink-0 transition-all duration-300 ease-in-out ${collapsed ? 'w-20' : 'w-64'} h-screen m-4 flex flex-col sticky top-0 z-50 overflow-y-auto`}>
      <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0">
        {!collapsed && <h2 className="text-lg font-bold text-blue-300 animate-fade-in">📦 Estoque Pro</h2>}
        <button
          className="bg-transparent text-slate-300 p-2 rounded-2xl hover:bg-white/10 transition"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expandir' : 'Recolher'}
        >
          {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      <nav className={`flex flex-col gap-2 p-4 flex-1 ${collapsed ? 'items-center' : ''}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl transition duration-200 ease-out ${
                isActive
                  ? 'bg-blue-500/15 text-blue-300 border-l-4 border-blue-500 pl-4'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              } ${collapsed ? 'justify-center p-3' : 'px-4 py-3'}`
            }
            title={collapsed ? item.label : ''}
          >
            <span className="flex items-center justify-center flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="animate-fade-in text-sm">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
