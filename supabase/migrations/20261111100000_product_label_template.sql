-- Modelo de etiqueta salvo por produto (painel / filtro completa / filtro simples).
-- Aditiva: o código funciona sem a coluna (cai na detecção automática), mas só salva com ela.
alter table public.products
  add column if not exists label_template jsonb;

comment on column public.products.label_template is
  'Modelo de etiqueta 100x20 da produção: {modelo, classe, vazao, perda_inicial, perda_final, filtros_por_unidade, filtro_codigo, filtro_descricao, filtro_modelo, filtro_classe, ...}';
