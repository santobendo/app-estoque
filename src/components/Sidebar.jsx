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
  X
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { path: '/', icon: <LayoutDashboard size={22} />, label: 'Gestão' },
    { path: '/entradas', icon: <ArrowDownToLine size={22} />, label: 'Entradas' },
    { path: '/saidas', icon: <ArrowUpFromLine size={22} />, label: 'Saídas' },
    { path: '/ajustes', icon: <Settings2 size={22} />, label: 'Ajustes' },
    { path: '/compras', icon: <ShoppingCart size={22} />, label: 'Compras' },
    { path: '/historico', icon: <History size={22} />, label: 'Histórico' },
  ];

  return (
    <aside className={`sidebar glass-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        {!collapsed && <h2 className="animate-fade-in">📦 Estoque Pro</h2>}
        <button 
          className="toggle-btn" 
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <Menu size={20} /> : <X size={20} />}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            title={collapsed ? item.label : ''}
          >
            <span className="nav-icon">{item.icon}</span>
            {!collapsed && <span className="nav-label animate-fade-in">{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
