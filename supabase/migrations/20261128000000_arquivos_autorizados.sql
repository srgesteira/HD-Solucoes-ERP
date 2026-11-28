-- Norma v1.2, item 9: referência dos hashes dos arquivos de dono único FORA do PC.
-- Grava só o administrador (sessão do ERP, pelo Claude do app). Robôs/script só leem.
create table if not exists public.arquivos_autorizados (
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  arquivo        text not null check (arquivo in ('COHD-contexto.md','mapa-robos.md','norma-estrutura.md','INSTRUCOES.md')),
  sha256         text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text not null,
  primary key (tenant_id, arquivo)
);
alter table public.arquivos_autorizados enable row level security;

-- Histórico (toda troca de hash fica registrada).
create table if not exists public.arquivos_autorizados_hist (
  id             bigserial primary key,
  tenant_id      uuid not null,
  arquivo        text not null,
  sha256         text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text not null
);
alter table public.arquivos_autorizados_hist enable row level security;
