-- markup_percent NULL = preço unitário definido manualmente; NOT NULL = calculado por markup

COMMENT ON COLUMN public.quote_items.markup_percent IS
  'Markup (%) sobre cost_price. NULL quando unit_price foi definido manualmente no orçamento.';
