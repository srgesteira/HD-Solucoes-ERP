-- Fatia C: volume/embalagem na Expedição (shipments).
-- volumes_count = quantidade de volumes; packaging_description = descrição da embalagem.

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS volumes_count integer
    CHECK (volumes_count IS NULL OR volumes_count >= 0),
  ADD COLUMN IF NOT EXISTS packaging_description text;

COMMENT ON COLUMN public.shipments.volumes_count IS
  'Quantidade de volumes da carga (Expedição).';
COMMENT ON COLUMN public.shipments.packaging_description IS
  'Descrição da embalagem (Expedição).';
