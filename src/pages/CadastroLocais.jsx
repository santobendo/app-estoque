import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import TabelaCrud from '../components/TabelaCrud';

export default function CadastroLocais() {
  const { isAdmin } = useAuth();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link
          to="/cadastros"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-app-text-secondary hover:text-app-text transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Cadastros
        </Link>
        <h1 className="text-2xl mb-0.5">Locais (Estoques)</h1>
        <p className="text-[13px] text-app-text-secondary">
          Locais físicos onde o estoque é mantido. Desative um local para ocultá-lo sem perder o histórico.
        </p>
      </header>

      <TabelaCrud
        tabela="locais"
        colunas={[
          { field: 'nome', label: 'Nome' },
          { field: 'descricao', label: 'Descrição', placeholder: 'Descrição (opcional)' },
        ]}
        labelNovo="Novo Local"
        comAtivo
        readOnly={!isAdmin}
      />
    </div>
  );
}
