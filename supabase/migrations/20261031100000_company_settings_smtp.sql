-- SMTP da empresa (Zoho Mail) para enviar orçamentos, PC e NF-e (DANFE + XML).
alter table public.company_settings
  add column if not exists smtp_host text,
  add column if not exists smtp_port integer,
  add column if not exists smtp_user text,
  add column if not exists smtp_password text,
  add column if not exists smtp_from_name text,
  add column if not exists smtp_from_email text,
  add column if not exists smtp_secure boolean not null default true;

comment on column public.company_settings.smtp_host is
  'Servidor SMTP (Zoho: smtp.zoho.com ou smtppro.zoho.com).';
comment on column public.company_settings.smtp_user is
  'Utilizador SMTP — normalmente o e-mail completo da caixa Zoho.';
