-- Norma v1.0, item 2: evento nunca é rejeitado; incompleto é marca, não estado.
alter table public.eventos_hd add column if not exists incompleto boolean not null default false;
alter table public.eventos_hd add column if not exists campos_faltando text[];
alter table public.eventos_hd add column if not exists severidade_original text;
select count(*) total, count(*) filter (where incompleto) incompletos from public.eventos_hd;
