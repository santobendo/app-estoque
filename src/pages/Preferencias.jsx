import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/auth';
import { useToast } from '../lib/toast';
import { traduzErro } from '../lib/erros';
import { FilePlus, FileX, Check } from 'lucide-react';
import { SectionHeader } from '../components/Secao';
import CartaoOpcao from '../components/CartaoOpcao';
import { Spinner } from '../components/TabelaCrud';

/* ─── Preferências ───
   Preferência é do usuário; parâmetro é do sistema. Esta tela é só do primeiro
   grupo, e é por isso que ela NÃO é uma aba de Configurações: aquela tela é
   bloqueada para quem não é admin (Configuracoes.jsx) e nem aparece na barra
   lateral, enquanto aqui todo usuário precisa chegar.

   Quando houver parâmetro de verdade — ajuste que o admin faz para todos —
   ele vai para outro lugar, com outra tabela, porque não é atributo de
   ninguém. As duas telas convivem sem conflito.

   O valor mora em perfis.preferencia_requisicao. O usuário grava a própria
   linha pela policy "usuario edita proprio perfil"; o tg_protege_perfil barra
   is_admin, ativo e papel_id por nome, e esta coluna não está nessa lista. */

/* Os dois cartões são os mesmos da tela de Movimentações, com os mesmos
   ícones e cores, de propósito: a preferência tem que parecer a coisa que
   configura. Falta o terceiro ("Requisição existente") porque ele não é
   estado em que a tela possa ABRIR — significa partir de uma requisição ainda
   não escolhida, e a validação recusaria a gravação até escolher. O check da
   coluna no banco diz a mesma coisa, então a tela e o schema concordam. */
const OPCOES = [
  {
    valor: 'sem',
    icone: FileX,
    cor: 'neutro',
    titulo: 'Sem requisição',
    descricao: 'Baixa solta, sem pedido',
    explicacao: 'A tela de Movimentações abre como sempre abriu. Quem precisar de '
      + 'requisição escolhe na hora, com um clique.',
  },
  {
    valor: 'nova',
    icone: FilePlus,
    cor: 'indigo',
    titulo: 'Nova requisição',
    descricao: 'Abre um número novo',
    explicacao: 'A tela abre já em modo requisição, e o número nasce na primeira '
      + 'saída que você gravar. Poupa um clique por sessão de quem trabalha '
      + 'sempre por pedido.',
  },
];

export default function Preferencias() {
  const { perfil, refreshPerfil } = useAuth();
  const toast = useToast();
  const [salvando, setSalvando] = useState(null);

  const atual = perfil?.preferencia_requisicao ?? 'sem';

  const escolher = async (valor) => {
    if (valor === atual || salvando) return;

    setSalvando(valor);
    /* O .select() existe pelo mesmo motivo da exclusão no Histórico: sem ele o
       PostgREST devolve sucesso com zero linhas quando o RLS recusa, e a tela
       diria que gravou sem ter gravado. */
    const { data, error } = await supabase
      .from('perfis')
      .update({ preferencia_requisicao: valor })
      .eq('id', perfil.id)
      .select('id');
    setSalvando(null);

    if (error) {
      toast.erro(traduzErro(error));
      return;
    }
    if (!data || data.length === 0) {
      toast.erro('Nada foi salvo — a preferência não pôde ser gravada neste perfil.');
      return;
    }

    /* Relê o perfil para que Movimentações use o valor novo já nesta sessão. */
    await refreshPerfil();
    toast.sucesso('Preferência salva.');
  };

  if (!perfil) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      <header>
        <h1 className="text-2xl mb-0.5">Preferências</h1>
        <p className="text-[13px] text-app-text-secondary">
          Ajustes do seu usuário. Valem só para{' '}
          <span className="font-semibold text-app-text">{perfil.nome}</span>, em qualquer
          aparelho em que você entrar.
        </p>
      </header>

      <div className="card max-w-3xl">
        <SectionHeader
          number="1"
          title="Movimentações"
          subtitle="como a tela de saída abre"
        />

        <div className="p-6 flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OPCOES.map(o => (
              <CartaoOpcao
                key={o.valor}
                ativo={atual === o.valor}
                onClick={() => escolher(o.valor)}
                icone={o.icone}
                titulo={o.titulo}
                descricao={o.descricao}
                cor={o.cor}
              />
            ))}
          </div>

          {/* A explicação do que está escolhido, para a escolha não ser um
              palpite sobre o que o cartão faz. */}
          <div className="flex items-start gap-2 text-[12px] text-app-text-secondary">
            {salvando
              ? <Spinner />
              : <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />}
            <p>
              {salvando
                ? 'Salvando...'
                : OPCOES.find(o => o.valor === atual)?.explicacao}
            </p>
          </div>

          <p className="text-[11px] text-app-text-label border-t border-app-border-inner pt-4">
            A seção de requisição só aparece em saída, e hoje só para
            administradores. Se você não a vê na tela de Movimentações, esta
            preferência não muda nada para você ainda.
          </p>
        </div>
      </div>
    </div>
  );
}
