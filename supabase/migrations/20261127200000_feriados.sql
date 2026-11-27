-- Etapa 7 (plano v2.2): feriados para o tempo útil (push repetido, aguardando Helder, folga do PCP).
-- Tabela global (vale para todos os tenants). Só "feriado" conta; "facultativo" fica registrado mas não para a contagem.
create table if not exists public.feriados (
  data        date primary key,
  nome        text not null,
  abrangencia text not null default 'nacional' check (abrangencia in ('nacional','estadual_sp','municipal_sp')),
  tipo        text not null default 'feriado' check (tipo in ('feriado','facultativo'))
);
alter table public.feriados enable row level security;

insert into public.feriados (data, nome, abrangencia, tipo) values
  ('2026-01-01','Confraternização Universal','nacional','feriado'),
  ('2026-01-25','Aniversário de São Paulo','municipal_sp','feriado'),
  ('2026-02-16','Carnaval (segunda)','nacional','facultativo'),
  ('2026-02-17','Carnaval (terça)','nacional','facultativo'),
  ('2026-04-03','Sexta-feira Santa','nacional','feriado'),
  ('2026-04-21','Tiradentes','nacional','feriado'),
  ('2026-05-01','Dia do Trabalho','nacional','feriado'),
  ('2026-06-04','Corpus Christi','municipal_sp','feriado'),
  ('2026-07-09','Revolução Constitucionalista','estadual_sp','feriado'),
  ('2026-09-07','Independência','nacional','feriado'),
  ('2026-10-12','Nossa Senhora Aparecida','nacional','feriado'),
  ('2026-11-02','Finados','nacional','feriado'),
  ('2026-11-15','Proclamação da República','nacional','feriado'),
  ('2026-11-20','Consciência Negra','nacional','feriado'),
  ('2026-12-25','Natal','nacional','feriado'),
  ('2027-01-01','Confraternização Universal','nacional','feriado'),
  ('2027-01-25','Aniversário de São Paulo','municipal_sp','feriado'),
  ('2027-02-08','Carnaval (segunda)','nacional','facultativo'),
  ('2027-02-09','Carnaval (terça)','nacional','facultativo'),
  ('2027-03-26','Sexta-feira Santa','nacional','feriado'),
  ('2027-04-21','Tiradentes','nacional','feriado'),
  ('2027-05-01','Dia do Trabalho','nacional','feriado'),
  ('2027-05-27','Corpus Christi','municipal_sp','feriado'),
  ('2027-07-09','Revolução Constitucionalista','estadual_sp','feriado'),
  ('2027-09-07','Independência','nacional','feriado'),
  ('2027-10-12','Nossa Senhora Aparecida','nacional','feriado'),
  ('2027-11-02','Finados','nacional','feriado'),
  ('2027-11-15','Proclamação da República','nacional','feriado'),
  ('2027-11-20','Consciência Negra','nacional','feriado'),
  ('2027-12-25','Natal','nacional','feriado')
on conflict (data) do nothing;
