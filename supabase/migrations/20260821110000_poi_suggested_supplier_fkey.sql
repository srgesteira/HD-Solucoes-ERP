-- Garantir FK nomeada para PostgREST (relacionamento suggested_supplier_id → suppliers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_order_items_suggested_supplier_id_fkey'
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_suggested_supplier_id_fkey
      FOREIGN KEY (suggested_supplier_id)
      REFERENCES public.suppliers(id)
      ON DELETE SET NULL;
  END IF;
END $$;
