-- Campos para NFS-e (Focus) — lista de serviço, ISS e perfil São Paulo (reforma / exemplo Focus SP).
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS nfse_item_lista_servico TEXT,
  ADD COLUMN IF NOT EXISTS nfse_iss_aliquota NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS nfse_prestador_codigo_municipio TEXT DEFAULT '3550308',
  ADD COLUMN IF NOT EXISTS nfse_codigo_nbs TEXT DEFAULT '000000000',
  ADD COLUMN IF NOT EXISTS nfse_codigo_indicador_operacao TEXT DEFAULT '000000',
  ADD COLUMN IF NOT EXISTS nfse_ibs_cbs_classificacao_tributaria TEXT DEFAULT '000001',
  ADD COLUMN IF NOT EXISTS nfse_use_sao_paulo_payload BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfse_codigo_tributario_municipio TEXT;

COMMENT ON COLUMN company_settings.nfse_item_lista_servico IS 'Código item lista de serviços (SP: formato prefeitura, ex. 07498; outros municípios: LC 116 ex. 01.01).';
COMMENT ON COLUMN company_settings.nfse_iss_aliquota IS 'Alíquota ISS (%) para envio à Focus (ex.: 5 = 5%).';
COMMENT ON COLUMN company_settings.nfse_prestador_codigo_municipio IS 'IBGE do município do prestador (3550308 = São Paulo).';
COMMENT ON COLUMN company_settings.nfse_use_sao_paulo_payload IS 'Se true, monta JSON conforme guia Focus NFS-e São Paulo (reforma).';
