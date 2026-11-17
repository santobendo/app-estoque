/* Mensagens de erro do Postgres em português.

   Morava em components/TabelaCrud.jsx, que por isso exportava componente e
   função ao mesmo tempo — o que atrapalha o hot reload e era um dos erros
   de react-refresh/only-export-components registrados na dívida técnica.

   Os códigos vêm do SQLSTATE e são os que este schema realmente produz:
   23505 pelos unique de nome/sigla, 23503 pelos on delete restrict, 23514
   pelo check de saldo não negativo em estoques, 42501 quando a policy de
   RLS recusa. O default devolve error.message porque o resto é imprevisto
   e esconder a mensagem original tornaria o suporte impossível. */
export function traduzErro(error) {
  if (!error) return null;
  switch (error.code) {
    case '23505': return 'Já existe um registro com esse nome/sigla.';
    case '23503': return 'Não é possível excluir: este registro está sendo usado em outro cadastro.';
    case '23502': return 'Preencha os campos obrigatórios.';
    case '23514': return 'Operação bloqueada: o saldo em estoque não pode ficar negativo.';
    /* 42501 chega de dois lugares bem diferentes, e tratar os dois igual
       apagava a metade útil. Um é a policy de RLS recusando a linha, com
       mensagem do Postgres em inglês ("new row violates row-level security
       policy for table ..."), que não serve para ninguém ler. O outro são os
       nossos triggers de proteção — fn_protege_perfil,
       fn_protege_requisicao e fn_protege_requisicao_item —, que levantam
       42501 com texto em português dizendo o que foi barrado E qual é o
       caminho sem perda ("exclua a movimentação no Histórico primeiro").
       Essa segunda mensagem é escrita para o usuário final, e substituí-la
       pelo genérico era jogar fora a única explicação que ele teria. */
    case '42501':
      return /row-level security|permission denied/i.test(error.message ?? '')
        ? 'Você não tem permissão para esta operação.'
        : error.message;
    default:      return error.message;
  }
}
