import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { MapPin, ChevronsUpDown, Globe, Eye } from 'lucide-react';
import { useLocal } from '../contexts/LocalContext';
import { useAuth } from '../contexts/AuthContext';

/* Rotas onde o local selecionado não muda nada — nem o que se lê, nem o que
   se grava. "/produtos" e "/cadastro-produto" já estiveram nesta lista: leem
   dados globais, mas gravam no local da barra. Enquanto estavam aqui, o selo
   "Somente leitura" ficava suprimido justamente onde ele mais fazia falta. */
const ROTAS_GLOBAIS = ['/cadastros', '/configuracoes'];

export default function TopBar() {
  const { locais, localAtual, setLocalAtual, loadingLocal, podeEditarAtual } = useLocal();
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const isGlobal = ROTAS_GLOBAIS.some(r => pathname.startsWith(r));

  return (
    <div className="h-14 bg-white border-b border-app-border flex items-center gap-3 px-5 shrink-0 print:hidden">
      <div className="flex items-center gap-2 shrink-0">
        <MapPin size={15} className="text-app-text-label" />
        <span className="text-[11px] font-bold text-app-text-label uppercase tracking-widest">Local</span>
      </div>

      {loadingLocal ? (
        <span className="text-[12px] text-app-text-secondary">Carregando…</span>
      ) : locais.length === 0 ? (
        /* Lista vazia tem duas causas distintas, e mandar um usuário comum
           "cadastrar um local" seria mentira dupla: ele não tem permissão
           para isso, e não é esse o problema dele. */
        isAdmin ? (
          <span className="text-[12px] text-app-text-secondary">
            Nenhum local ativo —{' '}
            <Link to="/cadastros/locais" className="font-semibold text-app-text hover:underline">
              cadastre um local
            </Link>{' '}
            para começar.
          </span>
        ) : (
          <span className="text-[12px] text-app-text-secondary">
            Você não tem acesso a nenhum local — peça a um administrador para liberar.
          </span>
        )
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

      {/* Indicador único do modo somente leitura. Sem ele, o usuário
          descobriria a restrição só ao tentar salvar e falhar. */}
      {!isGlobal && localAtual && !podeEditarAtual && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold badge badge-sky rounded-md px-2 py-1">
          <Eye size={11} />
          Somente leitura
        </span>
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
