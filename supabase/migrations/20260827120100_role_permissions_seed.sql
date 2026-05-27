-- Seed: 30 cargos R2 + module_keys por perfil

INSERT INTO public.role_permissions (role_key, role_name, module_key, permissions, description)
VALUES
  ('gerente_industrial', 'Gerente Industrial', 'core', '{"screens":["*"],"actions":["*"]}', 'Acesso transversal'),
  ('diretor', 'Diretor Industrial', 'core', '{"screens":["*"],"actions":["*","reports"]}', 'Acesso total + relatórios'),
  ('engenharia_supervisor', 'Supervisor de Engenharia', 'engenharia', '{"screens":["products","bom","ecr","approve"],"actions":["*"]}', NULL),
  ('engenharia_tecnico', 'Técnico de Engenharia', 'engenharia', '{"screens":["products","bom","costs"],"actions":["create","edit"]}', NULL),
  ('engenharia_cadastro', 'Cadastro Engenharia', 'engenharia', '{"screens":["products","structure"],"actions":["edit"]}', NULL),
  ('engenharia_desenho', 'Desenhista', 'engenharia', '{"screens":["documents","drawings"],"actions":["upload"]}', NULL),
  ('vendas_vendedor', 'Vendedor', 'vendas', '{"screens":["quotes","orders"],"actions":["create","edit"]}', NULL),
  ('vendas_supervisor', 'Supervisor Comercial', 'vendas', '{"screens":["quotes","orders","crm"],"actions":["*"]}', NULL),
  ('faturamento_analista', 'Analista de Crédito', 'faturamento', '{"screens":["credit-analysis"],"actions":["approve","reject"]}', NULL),
  ('faturamento_financeiro', 'Financeiro', 'faturamento', '{"screens":["receivables","payables","cash-flow"],"actions":["*"]}', NULL),
  ('faturamento_fiscal', 'Fiscal', 'faturamento', '{"screens":["nfes","tax-apurations"],"actions":["issue","cancel"]}', NULL),
  ('logistica_supervisor', 'Supervisor de Logística', 'compras', '{"screens":["*"],"actions":["*"]}', 'Visão compras+PCP+almox+expedição'),
  ('compras_assistente', 'Assistente de Compras', 'compras', '{"screens":["orders","invoices"],"actions":["create","edit"]}', NULL),
  ('compras_auxiliar', 'Auxiliar de Compras', 'compras', '{"screens":["orders"],"actions":["view","track"]}', NULL),
  ('pcp_assistente', 'Assistente de PCP', 'pcp', '{"screens":["mrp","schedule"],"actions":["run_mrp","edit_schedule"]}', NULL),
  ('pcp_auxiliar', 'Auxiliar de PCP', 'pcp', '{"screens":["production_orders"],"actions":["create","update"]}', NULL),
  ('almox_lider', 'Líder de Almoxarifado', 'almoxarifado', '{"screens":["stock","movements","supply"],"actions":["*"]}', NULL),
  ('almox_auxiliar', 'Auxiliar de Almoxarifado', 'almoxarifado', '{"screens":["supply","picking"],"actions":["deliver"]}', NULL),
  ('estoque_assistente', 'Assistente de Estoque', 'almoxarifado', '{"screens":["stock","inventory"],"actions":["adjust"]}', NULL),
  ('estoque_auxiliar', 'Auxiliar de Estoque', 'almoxarifado', '{"screens":["stock"],"actions":["view","label"]}', NULL),
  ('expedicao_agente', 'Agente de Carga', 'expedicao', '{"screens":["shipments","carriers"],"actions":["dispatch"]}', NULL),
  ('expedicao_auxiliar', 'Auxiliar de Expedição', 'expedicao', '{"screens":["shipments"],"actions":["pack","load"]}', NULL),
  ('producao_supervisor', 'Supervisor de Produção', 'producao', '{"screens":["*"],"actions":["*"]}', 'Inclui visão qualidade'),
  ('producao_encarregado', 'Encarregado de Produção', 'producao', '{"screens":["lines","orders"],"actions":["assign"]}', NULL),
  ('producao_lider', 'Líder de Linha', 'producao', '{"screens":["lines"],"actions":["operate"]}', NULL),
  ('producao_controller', 'Controller de Linha', 'producao', '{"screens":["timesheet"],"actions":["clock"]}', NULL),
  ('producao_operador', 'Operador de Produção', 'producao', '{"screens":["operator"],"actions":["mark_step"]}', NULL),
  ('qualidade_supervisor', 'Supervisor de Qualidade', 'qualidade', '{"screens":["*"],"actions":["*"]}', NULL),
  ('qualidade_recebimento', 'Qualidade Recebimento', 'qualidade', '{"screens":["receiving"],"actions":["approve","reject"]}', NULL),
  ('qualidade_cq_linha', 'CQ de Linha', 'qualidade', '{"screens":["cq-line"],"actions":["approve","reject"]}', NULL)
ON CONFLICT (role_key) DO UPDATE SET
  role_name = EXCLUDED.role_name,
  module_key = EXCLUDED.module_key,
  permissions = EXCLUDED.permissions,
  description = EXCLUDED.description;

UPDATE public.role_permissions SET module_keys = ARRAY['*']::TEXT[]
WHERE role_key IN ('gerente_industrial', 'diretor');

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'engenharia']::TEXT[]
WHERE role_key IN ('engenharia_supervisor', 'engenharia_tecnico', 'engenharia_cadastro', 'engenharia_desenho');

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'compras']::TEXT[]
WHERE role_key IN ('compras_assistente', 'compras_auxiliar');

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'pcp', 'compras', 'almoxarifado']::TEXT[]
WHERE role_key = 'pcp_assistente';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'pcp']::TEXT[]
WHERE role_key = 'pcp_auxiliar';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'almoxarifado']::TEXT[]
WHERE role_key IN ('almox_lider', 'almox_auxiliar', 'estoque_assistente', 'estoque_auxiliar');

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'expedicao']::TEXT[]
WHERE role_key IN ('expedicao_agente', 'expedicao_auxiliar');

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'producao', 'qualidade']::TEXT[]
WHERE role_key = 'producao_supervisor';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'producao']::TEXT[]
WHERE role_key IN ('producao_encarregado', 'producao_lider', 'producao_controller');

UPDATE public.role_permissions SET module_keys = ARRAY['producao']::TEXT[]
WHERE role_key = 'producao_operador';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'qualidade', 'producao']::TEXT[]
WHERE role_key = 'qualidade_supervisor';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'qualidade']::TEXT[]
WHERE role_key = 'qualidade_recebimento';

UPDATE public.role_permissions SET module_keys = ARRAY['qualidade']::TEXT[]
WHERE role_key = 'qualidade_cq_linha';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'compras', 'pcp', 'almoxarifado', 'expedicao']::TEXT[]
WHERE role_key = 'logistica_supervisor';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'vendas']::TEXT[]
WHERE role_key = 'vendas_vendedor';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'vendas', 'faturamento']::TEXT[]
WHERE role_key = 'vendas_supervisor';

UPDATE public.role_permissions SET module_keys = ARRAY['core', 'faturamento']::TEXT[]
WHERE role_key IN ('faturamento_analista', 'faturamento_financeiro', 'faturamento_fiscal');

UPDATE public.role_permissions
SET module_keys = CASE
  WHEN module_key = 'core' THEN ARRAY['core']::TEXT[]
  ELSE ARRAY['core', module_key]::TEXT[]
END
WHERE module_keys IS NULL OR module_keys = ARRAY[]::TEXT[];
