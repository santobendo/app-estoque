import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import './Layout.css';

/* Mapa de rota → título/subtítulo exibido no header */
const ROUTE_META = {
  '/':          { title: 'Catálogo de Produtos',  subtitle: 'Visualize e gerencie todos os itens do estoque' },
  '/cadastro':  { title: 'Novo Produto',           subtitle: 'Cadastre um novo item no sistema' },
  '/entradas':  { title: 'Entradas',               subtitle: 'Registre a entrada de mercadorias' },
  '/saidas':    { title: 'Saídas',                 subtitle: 'Registre a saída de mercadorias' },
  '/ajustes':   { title: 'Ajustes de Estoque',     subtitle: 'Corrija quantidades manualmente' },
  '/compras':   { title: 'Análise de Compras',     subtitle: 'Planeje reposições com base no consumo' },
  '/historico': { title: 'Histórico',              subtitle: 'Consulte todas as movimentações registradas' },
  '/relatorio': { title: 'Relatório de Estoque',   subtitle: 'Gere e imprima o inventário atual' },
};

const Layout = () => {
  const location = useLocation();
  const meta = ROUTE_META[location.pathname] ?? { title: 'Estoque Pro', subtitle: '' };

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-body">
        {/* ── Header ── */}
        <header className="app-header">
          <div className="app-header__left">
            <h1 className="app-header__title">{meta.title}</h1>
            {meta.subtitle && (
              <p className="app-header__subtitle">{meta.subtitle}</p>
            )}
          </div>
        </header>

        {/* ── Conteúdo ── */}
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
