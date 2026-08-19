-- =============================================================
-- MIGRAÇÃO — Ajuste de estoque (contagem física)
-- =============================================================
-- Rodar no SQL Editor do Supabase (executa como postgres).
-- Objetivo:
--   1. Excluir saídas de 'ajuste' do cálculo de consumo (view),
--      para que o ajuste não infle a sugestão de compra.
--   2. Restringir o motivo 'ajuste' a admins na policy de insert.
--
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- Aplicar no banco de TESTES agora; no de PRODUÇÃO só ao subir a feature.
-- =============================================================


-- -------------------------------------------------------------
-- 1. VIEW — consumo dos últimos 30 dias
--    (agora exclui 'descarte' E 'ajuste')
-- -------------------------------------------------------------
create or replace view vw_consumo_30_dias as
with consumo as (
  select
    e.local_id,
    a.produto_id,
    a.unidade_id,
    sum(m.quantidade * a.quantidade_unitaria) as consumo_base
  from movimentacoes m
  join estoques      e  on e.id = m.estoque_id
  join apresentacoes a  on a.id = e.apresentacao_id
  left join motivos_movimentacao mo on mo.id = m.motivo_id
  where m.tipo  = 'saida'
    and (mo.codigo is null or mo.codigo not in ('descarte', 'ajuste'))
    and m.data >= now() - interval '30 days'
  group by e.local_id, a.produto_id, a.unidade_id
),
saldo as (
  select
    e.local_id,
    a.produto_id,
    a.unidade_id,
    sum(e.quantidade_atual)                         as embalagens,
    sum(e.quantidade_atual * a.quantidade_unitaria) as estoque_base,
    sum(e.estoque_minimo   * a.quantidade_unitaria) as minimo_base
  from estoques      e
  join apresentacoes a on a.id = e.apresentacao_id
  group by e.local_id, a.produto_id, a.unidade_id
)
select
  p.id                                   as produto_id,
  p.nome                                 as produto,
  c.nome                                 as categoria,
  u.sigla                                as unidade,
  l.id                                   as local_id,
  l.nome                                 as local,
  round(coalesce(co.consumo_base, 0), 4) as consumo_total_unidade_base,
  s.embalagens                           as estoque_atual_unidades,
  round(s.estoque_base, 4)               as estoque_atual_unidade_base,
  round(s.minimo_base, 4)                as estoque_minimo_unidade_base
from saldo s
join produtos        p on p.id = s.produto_id
left join categorias c on c.id = p.categoria_id
join locais          l on l.id = s.local_id
join unidades        u on u.id = s.unidade_id
left join consumo   co on co.produto_id = s.produto_id
                      and co.local_id   = s.local_id
                      and co.unidade_id = s.unidade_id;


-- -------------------------------------------------------------
-- 2. POLICY — insert em movimentacoes
--    (motivo 'ajuste' restrito a admin)
-- -------------------------------------------------------------
drop policy if exists "ativos podem inserir movimentacoes" on movimentacoes;

create policy "ativos podem inserir movimentacoes"
  on movimentacoes for insert to authenticated
  with check (
    criado_por = auth.uid()
    and fn_is_ativo()
    and (
      not exists (
        select 1 from motivos_movimentacao mo
        where mo.id = motivo_id and mo.codigo = 'ajuste'
      )
      or fn_is_admin()
    )
  );


-- -------------------------------------------------------------
-- 3. Garantir que o motivo 'ajuste' existe
--    (necessário se o banco de testes for mais antigo)
-- -------------------------------------------------------------
insert into motivos_movimentacao (codigo, descricao)
values ('ajuste', 'Ajuste de inventário')
on conflict (codigo) do nothing;


-- -------------------------------------------------------------
-- 4. Conferência (opcional) — deve mostrar not in ('descarte', 'ajuste')
-- -------------------------------------------------------------
-- select pg_get_viewdef('vw_consumo_30_dias', true);
