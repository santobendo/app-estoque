-- Seeder for teste do sistema de estoque normalizado
-- Executar após criar o schema (estoque_schema_normalizado.sql)
-- 1. Papéis (roles)
INSERT INTO papeis (nome, descricao) VALUES
  ('Almoxarife', 'Responsável por controle de estoque'),
  ('Cozinheiro', 'Responsável por consumo de insumos'),
  ('Gerente', 'Gerencia operações');

-- 2. Perfis (users) – assumindo que já existem usuários no auth.users com IDs conhecidos
-- Para teste criamos perfis fictícios usando UUIDs fixos
INSERT INTO perfis (id, nome, papel_id, is_admin, ativo) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ana Silva', (SELECT id FROM papeis WHERE nome='Almoxarife'), false, true),
  ('22222222-2222-2222-2222-222222222222', 'Bruno Lima', (SELECT id FROM papeis WHERE nome='Cozinheiro'), false, true),
  ('33333333-3333-3333-3333-333333333333', 'Carlos Admin', NULL, true, true);

-- 3. Categorias
INSERT INTO categorias (nome, descricao) VALUES
  ('Limpeza', 'Produtos de limpeza'),
  ('Alimentos', 'Produtos alimentícios'),
  ('Escritório', 'Materiais de escritório');

-- 4. Unidades de medida
INSERT INTO unidades (sigla, nome) VALUES
  ('L', 'Litro'),
  ('ML', 'Mililitro'),
  ('KG', 'Quilograma'),
  ('G', 'Grama'),
  ('UN', 'Unidade');

-- 5. Produtos
INSERT INTO produtos (nome, categoria_id, criado_por) VALUES
  ('Água Sanitária', (SELECT id FROM categorias WHERE nome='Limpeza'), '11111111-1111-1111-1111-111111111111'),
  ('Arroz', (SELECT id FROM categorias WHERE nome='Alimentos'), '11111111-1111-1111-1111-111111111111'),
  ('Caneta', (SELECT id FROM categorias WHERE nome='Escritório'), '11111111-1111-1111-1111-111111111111');

-- 6. Apresentações (embalagens)
INSERT INTO apresentacoes (produto_id, descricao, quantidade_unitaria, unidade_id, criado_por) VALUES
  ((SELECT id FROM produtos WHERE nome='Água Sanitária'), 'Água Sanitária 2L', 2, (SELECT id FROM unidades WHERE sigla='L'), '11111111-1111-1111-1111-111111111111'),
  ((SELECT id FROM produtos WHERE nome='Água Sanitária'), 'Água Sanitária 5L', 5, (SELECT id FROM unidades WHERE sigla='L'), '11111111-1111-1111-1111-111111111111'),
  ((SELECT id FROM produtos WHERE nome='Arroz'), 'Arroz 1KG', 1, (SELECT id FROM unidades WHERE sigla='KG'), '11111111-1111-1111-1111-111111111111'),
  ((SELECT id FROM produtos WHERE nome='Caneta'), 'Caneta Esferográfica', 1, (SELECT id FROM unidades WHERE sigla='UN'), '11111111-1111-1111-1111-111111111111');

-- 7. Locais de armazenamento
INSERT INTO locais (nome, descricao, ativo) VALUES
  ('Almoxarifado Central', 'Principal estoque da empresa', true),
  ('Cozinha', 'Estoque de insumos de cozinha', true);

-- 8. Estoques (inicialmente zero)
INSERT INTO estoques (apresentacao_id, local_id, quantidade_atual) SELECT a.id, l.id, 0 FROM apresentacoes a CROSS JOIN locais l;

-- 9. Motivos de movimentação
INSERT INTO motivos_movimentacao (codigo, descricao) VALUES
  ('compra', 'Compra de insumos'),
  ('uso', 'Uso/consumo interno'),
  ('descarte', 'Descarte de material inutilizado'),
  ('ajuste', 'Ajuste manual de estoque'),
  ('outro', 'Outro motivo');

-- 10. Movimentações iniciais (exemplo de consumo e compra)
-- Compra de 10 unidades de Água Sanitária 2L para o Almoxarifado
INSERT INTO movimentacoes (estoque_id, criado_por, tipo, quantidade, motivo_id)
SELECT e.id, '11111111-1111-1111-1111-111111111111', 'entrada', 10, (SELECT id FROM motivos_movimentacao WHERE codigo='compra')
FROM estoques e
JOIN apresentacoes a ON a.id = e.apresentacao_id
WHERE a.descricao = 'Água Sanitária 2L' AND e.local_id = (SELECT id FROM locais WHERE nome='Almoxarifado Central');

-- Uso de 2 unidades de Arroz 1KG na cozinha
INSERT INTO movimentacoes (estoque_id, criado_por, tipo, quantidade, motivo_id)
SELECT e.id, '22222222-2222-2222-2222-222222222222', 'saida', 2, (SELECT id FROM motivos_movimentacao WHERE codigo='uso')
FROM estoques e
JOIN apresentacoes a ON a.id = e.apresentacao_id
WHERE a.descricao = 'Arroz 1KG' AND e.local_id = (SELECT id FROM locais WHERE nome='Cozinha');

-- Ajuste manual: corrigir estoque de Caneta para 5 unidades no Almoxarifado
INSERT INTO movimentacoes (estoque_id, criado_por, tipo, quantidade, motivo_id)
SELECT e.id, '33333333-3333-3333-3333-333333333333', 'entrada', 5, (SELECT id FROM motivos_movimentacao WHERE codigo='ajuste')
FROM estoques e
JOIN apresentacoes a ON a.id = e.apresentacao_id
WHERE a.descricao = 'Caneta Esferográfica' AND e.local_id = (SELECT id FROM locais WHERE nome='Almoxarifado Central');

-- Fim do seeder
