import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Produtos from './pages/Produtos';
import CadastroProduto from './pages/CadastroProduto';
import Movimentacoes from './pages/Movimentacoes';
import Ajustes from './pages/Ajustes';
import Compras from './pages/Compras';
import Historico from './pages/Historico';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Produtos />} />
        <Route path="cadastro" element={<CadastroProduto />} />
        <Route path="entradas" element={<Movimentacoes tipo="entrada" />} />
        <Route path="saidas" element={<Movimentacoes tipo="saida" />} />
        <Route path="ajustes" element={<Ajustes />} />
        <Route path="compras" element={<Compras />} />
        <Route path="historico" element={<Historico />} />
      </Route>
    </Routes>
  );
}

export default App;
