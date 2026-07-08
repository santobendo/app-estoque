import React from 'react';
import { Link } from 'react-router-dom';
import { Tags, Warehouse, Ruler, ChevronRight } from 'lucide-react';

const CARDS = [
  {
    titulo: 'Categorias',
    descricao: 'Agrupamentos de produtos: Limpeza, Alimentação, Escritório…',
    path: '/cadastros/categorias',
    icon: Tags,
  },
  {
    titulo: 'Locais (Estoques)',
    descricao: 'Locais físicos onde o estoque é mantido: almoxarifado, cozinha…',
    path: '/cadastros/locais',
    icon: Warehouse,
  },
  {
    titulo: 'Unidades de Medida',
    descricao: 'Unidades usadas nas apresentações: L, ml, kg, g, un…',
    path: '/cadastros/unidades',
    icon: Ruler,
  },
];

export default function Cadastros() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl mb-0.5">Cadastros</h1>
        <p className="text-[13px] text-app-text-secondary">
          Dados de apoio do sistema — mantenha aqui as listas usadas nos demais cadastros.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(({ titulo, descricao, path, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className="card group p-5 flex flex-col gap-3 hover:border-app-text/30 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-150"
          >
            <div className="w-10 h-10 rounded-xl bg-app-bg flex items-center justify-center text-app-text shrink-0">
              <Icon size={20} />
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-app-text mb-0.5">{titulo}</p>
              <p className="text-[12px] text-app-text-secondary leading-relaxed">{descricao}</p>
            </div>
            <div className="flex items-center gap-1 text-[12px] font-semibold text-app-text-secondary group-hover:text-app-text transition-colors">
              Abrir <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
