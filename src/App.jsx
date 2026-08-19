import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { LocalProvider } from './contexts/LocalContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';

import Login              from './pages/Login';
import Catalog            from './pages/Catalog';
import CadastroProduto    from './pages/CadastroProduto';
import Movimentacoes      from './pages/Movimentacoes';
import Historico          from './pages/Historico';
import Compras            from './pages/Compras';
import RelatorioEstoque   from './pages/RelatorioEstoque';
import Configuracoes      from './pages/Configuracoes';
import Cadastros          from './pages/Cadastros';
import ProdutoDetalhe     from './pages/ProdutoDetalhe';
import CadastroCategorias from './pages/CadastroCategorias';
import CadastroLocais     from './pages/CadastroLocais';
import CadastroUnidades   from './pages/CadastroUnidades';

function App() {
  return (
    <AuthProvider>
      <LocalProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<MainLayout />}>
            <Route index                   element={<Catalog />} />
            <Route path="cadastro-produto" element={<CadastroProduto />} />
            <Route path="produtos/:id"     element={<ProdutoDetalhe />} />
            <Route path="movimentacoes"    element={<Movimentacoes />} />
            <Route path="historico"        element={<Historico />} />
            <Route path="compras"          element={<Compras />} />
            <Route path="relatorio-estoque" element={<RelatorioEstoque />} />
            <Route path="cadastros"            element={<Cadastros />} />
            <Route path="cadastros/categorias" element={<CadastroCategorias />} />
            <Route path="cadastros/locais"     element={<CadastroLocais />} />
            <Route path="cadastros/unidades"   element={<CadastroUnidades />} />
            <Route path="configuracoes"    element={<Configuracoes />} />
            <Route path="*"               element={<div className="p-8 text-app-text-secondary">Página não encontrada.</div>} />
          </Route>
        </Route>
      </Routes>
      </LocalProvider>
    </AuthProvider>
  );
}

export default App;
