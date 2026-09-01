-- =============================================================
-- SEED DE DEMONSTRAÇÃO — SOMENTE BANCO DE TESTES
--
-- NÃO RODE EM PRODUÇÃO. Cria locais, produtos, apresentações e
-- vínculos de estoque fictícios, apenas para ter o que olhar nas
-- telas. O `estoque_schema_normalizado.sql` deixou de trazer isso
-- de propósito: ele cria bancos de produção.
--
-- Pré-requisito: rodar `estoque_schema_normalizado.sql` antes —
-- as categorias e unidades referenciadas aqui vêm de lá (seção 19).
--
-- Tudo por lookup de nome, nunca por id fixo: os ids vêm de serial,
-- então comentar uma linha desloca as seguintes e quebra as FKs.
-- Idempotente: rodar duas vezes não duplica nada.
-- =============================================================

-- Papéis operacionais (sem "Admin" — administração é via is_admin)
insert into papeis (nome, descricao) values
  ('Almoxarife',  'Controla entrada e saída de materiais'),
  ('Cozinheiro',  'Registra consumo de itens na cozinha')
on conflict (nome) do nothing;

insert into locais (nome, descricao) values
  ('Almoxarifado', 'Depósito principal'),
  ('Cozinha',      'Estoque de uso diário da cozinha')
on conflict (nome) do nothing;

insert into produtos (nome, categoria_id) values
  ('ÁGUA SANITÁRIA', (select id from categorias where nome = 'Limpeza')),
  ('DETERGENTE',     (select id from categorias where nome = 'Limpeza')),
  ('PAPEL TOALHA',   (select id from categorias where nome = 'Higiene'))
on conflict (nome) do nothing;

insert into apresentacoes (produto_id, descricao, quantidade_unitaria, unidade_id)
select p.id, v.descricao, v.qtd, u.id
  from (values
    ('ÁGUA SANITÁRIA', 'Frasco 2L',    2.0, 'L'),
    ('ÁGUA SANITÁRIA', 'Galão 5L',     5.0, 'L'),
    ('DETERGENTE',     'Frasco 500ml', 0.5, 'L'),
    ('PAPEL TOALHA',   'Rolo',         1.0, 'un')
  ) as v(produto, descricao, qtd, sigla)
  join produtos p on p.nome  = v.produto
  join unidades u on u.sigla = v.sigla
on conflict do nothing;

insert into estoques (apresentacao_id, local_id)
select a.id, l.id
  from (values
    ('ÁGUA SANITÁRIA', 'Frasco 2L',    'Almoxarifado'),
    ('ÁGUA SANITÁRIA', 'Galão 5L',     'Almoxarifado'),
    ('DETERGENTE',     'Frasco 500ml', 'Almoxarifado'),
    ('DETERGENTE',     'Frasco 500ml', 'Cozinha'),
    ('PAPEL TOALHA',   'Rolo',         'Almoxarifado'),
    ('PAPEL TOALHA',   'Rolo',         'Cozinha')
  ) as v(produto, apresentacao, local)
  join produtos      p on p.nome       = v.produto
  join apresentacoes a on a.produto_id = p.id and a.descricao = v.apresentacao
  join locais        l on l.nome       = v.local
on conflict (apresentacao_id, local_id) do nothing;
