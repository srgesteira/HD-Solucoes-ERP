-- Plano v2.2 (revisão 27/11): prazos iniciais = combinado + 20% até haver histórico (P90 com mínimo de 10 entregas por fornecedor/etapa).
-- Data de revisão explícita; a auditoria mensal (7.3) confere e ajusta.
alter table public.lead_times add column if not exists revisar_em date;
update public.lead_times set revisar_em = date '2026-12-27' where revisar_em is null;
select fornecedor, etapa, dias, fonte, revisar_em from public.lead_times order by fornecedor, etapa;
