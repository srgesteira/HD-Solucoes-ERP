-- Conciliação bancária: valor efectivamente baixado no título (para reversão ao desfazer).

ALTER TABLE public.bank_statement_lines
  ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(14, 2);

NOTIFY pgrst, 'reload schema';
