import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import Catalog from './pages/Catalog';
import CadastroProduto from './pages/CadastroProduto';
import Login from './pages/Login';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Catalog />} />
            <Route path="cadastro-produto" element={<CadastroProduto />} />
            {/* Futuras rotas vão aqui */}
            <Route path="*" element={<div className="p-8">Página em construção...</div>} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
