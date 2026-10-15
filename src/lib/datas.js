/* Datas no fuso de quem está usando a tela.

   O bug que isto corrige: `new Date().toISOString().slice(0, 16)` devolve a
   hora em UTC, e um <input type="datetime-local"> interpreta o que recebe
   como hora local. No Brasil (UTC-3) o campo abria com três horas a mais, e
   como o submit converte o valor do campo de local para UTC — o que está
   certo — a movimentação era gravada três horas adiantada.

   A regra, daqui pra frente: toISOString() só para mandar instante ao banco,
   nunca para montar o que aparece numa tela ou num campo. Para isso, os
   helpers abaixo, que leem os componentes locais da data.

   O banco continua guardando timestamptz em UTC, que é o certo — a conversão
   para o fuso do navegador é feita na leitura, pelo toLocaleString. */

const dd = (n) => String(n).padStart(2, '0');

/* Valor para <input type="datetime-local">: "AAAA-MM-DDTHH:MM" local. */
export function agoraParaInput() {
  const d = new Date();
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`
       + `T${dd(d.getHours())}:${dd(d.getMinutes())}`;
}

/* "AAAA-MM-DD" de hoje, local. Para nome de arquivo e valor de <input
   type="date">. Com toISOString, depois das 21h o nome saía com a data de
   amanhã. */
export function hojeParaInput() {
  const d = new Date();
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

/* Extremos do dia local em ISO, para comparar com timestamptz no banco.

   "2026-10-15" sozinho no construtor do Date é lido como meia-noite UTC —
   21h do dia anterior aqui. Por isso a hora vai junto: string de data-hora
   sem o Z é lida como local, que é o que o usuário quis dizer ao escolher
   o dia no filtro. */
export const inicioDoDiaISO = (dia) => new Date(`${dia}T00:00:00.000`).toISOString();
export const fimDoDiaISO    = (dia) => new Date(`${dia}T23:59:59.999`).toISOString();
