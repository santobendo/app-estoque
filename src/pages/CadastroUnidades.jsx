import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import TabelaCrud from '../components/TabelaCrud';

export default function CadastroUnidades() {
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
        <h1 className="text-2xl mb-0.5">Unidades de Medida</h1>
        <p className="text-[13px] text-app-text-secondary">
          Unidades usadas nas apresentações dos produtos — a sigla aparece nas telas e relatórios.
        </p>
      </header>

      <TabelaCrud
        tabela="unidades"
        colunas={[
          { field: 'sigla', label: 'Sigla', placeholder: 'Ex: kg' },
          { field: 'nome', label: 'Nome completo', placeholder: 'Ex: Quilograma' },
        ]}
        labelNovo="Nova Unidade"
        readOnly={!isAdmin}
      />
    </div>
  );
}
