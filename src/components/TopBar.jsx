import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { MapPin, ChevronsUpDown, Globe } from 'lucide-react';
import { useLocal } from '../contexts/LocalContext';

/* Rotas que não são filtradas pelo local selecionado */
const ROTAS_GLOBAIS = ['/cadastros', '/configuracoes', '/produtos', '/cadastro-produto'];

export default function TopBar() {
  const { locais, localAtual, setLocalAtual, loadingLocal } = useLocal();
  const { pathname } = useLocation();
  const isGlobal = ROTAS_GLOBAIS.some(r => pathname.startsWith(r));

  return (
    <div className="h-14 bg-white border-b border-app-border flex items-center gap-3 px-5 shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <MapPin size={15} className="text-app-text-label" />
        <span className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">Local</span>
      </div>

      {loadingLocal ? (
        <span className="text-[12px] text-app-text-secondary">Carregando…</span>
      ) : locais.length === 0 ? (
        <span className="text-[12px] text-app-text-secondary">
          Nenhum local ativo —{' '}
          <Link to="/cadastros/locais" className="font-semibold text-app-text hover:underline">
            cadastre um local
          </Link>{' '}
          para começar.
        </span>
      ) : (
        <div className="relative">
          <select
            value={localAtual?.id ?? ''}
            onChange={e => setLocalAtual(e.target.value)}
            className="appearance-none bg-app-bg hover:bg-app-border/50 transition-colors rounded-lg pl-3 pr-8 py-1.5 text-[13px] font-semibold text-app-text cursor-pointer outline-none border border-transparent focus:border-app-border"
          >
            {locais.map(l => (
              <option key={l.id} value={l.id}>{l.nome}</option>
            ))}
          </select>
          <ChevronsUpDown
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-text-label pointer-events-none"
          />
        </div>
      )}

      {isGlobal && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-app-text-label bg-app-bg rounded-md px-2 py-1">
          <Globe size={11} />
          Página global — vale para todos os locais
        </span>
      )}
    </div>
  );
}
