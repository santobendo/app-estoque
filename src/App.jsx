import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';

import Login            from './pages/Login';
import Catalog          from './pages/Catalog';
import CadastroProduto  from './pages/CadastroProduto';
import Movimentacoes    from './pages/Movimentacoes';
import Historico        from './pages/Historico';
import Compras          from './pages/Compras';
import Configuracoes    from './pages/Configuracoes';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index                   element={<Catalog />} />
            <Route path="cadastro-produto" element={<CadastroProduto />} />
            <Route path="movimentacoes"    element={<Movimentacoes />} />
            <Route path="historico"        element={<Historico />} />
            <Route path="compras"          element={<Compras />} />
            <Route path="configuracoes"    element={<Configuracoes />} />
            <Route path="*"               element={<div className="p-8 text-app-text-secondary">Página não encontrada.</div>} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
