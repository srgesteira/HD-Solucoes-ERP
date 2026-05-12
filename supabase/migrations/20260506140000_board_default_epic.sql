-- Um projeto principal (épico) por quadro: tarefas do quadro ligam-se a ele e alimentam o Kanban global.

ALTER TABLE public.epics
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

DROP INDEX IF EXISTS idx_epics_one_default_per_board;
CREATE UNIQUE INDEX idx_epics_one_default_per_board
  ON public.epics (board_id)
  WHERE is_default = true;

-- Quadros sem nenhum épico: criar projeto principal (mesmo nome que o quadro)
INSERT INTO public.epics (tenant_id, board_id, title, description, created_by, sort_order, is_default)
SELECT b.tenant_id, b.id, b.name, b.description, b.created_by, 1000, true
FROM public.boards b
WHERE NOT EXISTS (
  SELECT 1 FROM public.epics e WHERE e.board_id = b.id
)
AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = b.tenant_id);

-- Já havia épicos mas nenhum marcado como principal: o primeiro (sort_order, created_at) passa a ser default
WITH ranked AS (
  SELECT
    id,
    board_id,
    ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY sort_order ASC, created_at ASC NULLS LAST) AS rn
  FROM public.epics
)
UPDATE public.epics e
SET is_default = true
FROM ranked r
WHERE e.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.epics e2
    WHERE e2.board_id = e.board_id AND e2.is_default = true
  );

-- Tarefas soltas no quadro passam a pertencer ao épico principal
UPDATE public.tasks t
SET epic_id = e.id
FROM public.epics e
WHERE t.board_id = e.board_id
  AND e.is_default = true
  AND t.epic_id IS NULL;

NOTIFY pgrst, 'reload schema';
