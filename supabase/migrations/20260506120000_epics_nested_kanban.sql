-- Épicos (projetos como UTA) com sub-tarefas aninhadas em tasks.epic_id

CREATE TABLE IF NOT EXISTS public.epics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.user_profiles(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epics_board ON public.epics(board_id);
CREATE INDEX IF NOT EXISTS idx_epics_tenant ON public.epics(tenant_id);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS epic_id UUID REFERENCES public.epics(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tasks_epic ON public.tasks(epic_id) WHERE epic_id IS NOT NULL;

ALTER TABLE public.epics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epics_via_board" ON public.epics;
CREATE POLICY "epics_via_board" ON public.epics
  FOR ALL TO authenticated
  USING (public.is_board_member(board_id, auth.uid()))
  WITH CHECK (public.is_board_member(board_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_epics_updated ON public.epics;
CREATE TRIGGER trg_epics_updated
  BEFORE UPDATE ON public.epics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
