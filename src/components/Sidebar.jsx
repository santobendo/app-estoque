import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Package,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  ShoppingCart,
  Clock,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Boxes,
} from 'lucide-react';
import './Sidebar.css';

const NAV_SECTIONS = [
  {
    label: 'Estoque',
    items: [
      { path: '/',         icon: Package,           label: 'Catálogo',      end: true },
      { path: '/cadastro', icon: Plus,               label: 'Novo Produto' },
    ],
  },
  {
    label: 'Movimentação',
    items: [
      { path: '/entradas', icon: ArrowDownToLine,    label: 'Entradas' },
      { path: '/saidas',   icon: ArrowUpFromLine,    label: 'Saídas' },
      { path: '/ajustes',  icon: SlidersHorizontal,  label: 'Ajustes' },
    ],
  },
  {
    label: 'Análise',
    items: [
      { path: '/compras',  icon: ShoppingCart,       label: 'Compras' },
      { path: '/historico',icon: Clock,              label: 'Histórico' },
      { path: '/relatorio',icon: FileText,           label: 'Relatório' },
    ],
  },
];

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>

      {/* ── Logo ── */}
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <Boxes size={20} strokeWidth={2} />
        </div>
        {!collapsed && (
          <div className="sidebar__brand-text">
            <span className="sidebar__app-name">Estoque Pro</span>
            <span className="sidebar__app-tag">Gestão de Inventário</span>
          </div>
        )}
      </div>

      {/* ── Navegação ── */}
      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="sidebar__section">
            {!collapsed && (
              <span className="sidebar__section-label">{section.label}</span>
            )}

            {section.items.map(({ path, icon: Icon, label, end }) => (
              <NavLink
                key={path}
                to={path}
                end={end}
                className={({ isActive }) =>
                  `sidebar__link ${isActive ? 'sidebar__link--active' : ''}`
                }
                title={collapsed ? label : undefined}
              >
                <span className="sidebar__link-icon">
                  <Icon size={18} strokeWidth={2} />
                </span>
                {!collapsed && (
                  <span className="sidebar__link-label">{label}</span>
                )}
                {!collapsed && (
                  <span className="sidebar__link-dot" />
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Rodapé / Toggle ── */}
      <div className="sidebar__footer">
        <div className="sidebar__separator" />
        <button
          className="sidebar__toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed
            ? <PanelLeftOpen  size={18} strokeWidth={2} />
            : <PanelLeftClose size={18} strokeWidth={2} />
          }
          {!collapsed && <span>Recolher</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
