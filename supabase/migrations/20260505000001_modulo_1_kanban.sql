-- =====================================================================
-- ERP HD Soluções Industriais
-- Módulo 1 — Agendador de Tarefas (Kanban)
--
-- Objetivos:
--   • Multi-tenant ready (tenant_id em todas as tabelas de domínio)
--   • Quadros, colunas customizáveis, etiquetas, tasks com DnD
--   • Comentários, anexos (Storage), activity log
--   • RLS por board_members
--   • Auto-criação de user_profile no signup do Auth
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. TENANTS (preparação multi-tenant futura)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.tenants (slug, name)
VALUES ('hd-interna', 'HD Soluções Industriais — Interno')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. USER_PROFILES (extensão de auth.users)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(200),
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant ON public.user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- ---------------------------------------------------------------------
-- 4. BOARDS (quadros Kanban)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#0f766e',
  icon VARCHAR(50),
  is_archived BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES public.user_profiles(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boards_tenant ON public.boards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_boards_created_by ON public.boards(created_by);

-- ---------------------------------------------------------------------
-- 5. BOARD_MEMBERS (quem tem acesso a quais boards)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_members (
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_board_members_user ON public.board_members(user_id);

-- ---------------------------------------------------------------------
-- 6. BOARD_COLUMNS (status customizáveis por board)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.board_columns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_columns_board ON public.board_columns(board_id, sort_order);

-- ---------------------------------------------------------------------
-- 7. LABELS (etiquetas por board)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#94a3b8',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labels_board ON public.labels(board_id);

-- ---------------------------------------------------------------------
-- 8. TASKS (cartões/tarefas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  board_id UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.board_columns(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMPTZ,
  assignee_id UUID REFERENCES public.user_profiles(id),
  created_by UUID NOT NULL REFERENCES public.user_profiles(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  -- Extensibilidade futura (módulos 4-6 do ERP):
  external_ref_type VARCHAR(50),
  external_ref_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_board ON public.tasks(board_id);
CREATE INDEX IF NOT EXISTS idx_tasks_column ON public.tasks(column_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_external_ref ON public.tasks(external_ref_type, external_ref_id) WHERE external_ref_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 9. TASK_LABELS (N:N)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_labels (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES public.labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- ---------------------------------------------------------------------
-- 10. TASK_COMMENTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.user_profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments(task_id, created_at);

-- ---------------------------------------------------------------------
-- 11. TASK_ATTACHMENTS (Supabase Storage)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.user_profiles(id),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments(task_id);

-- ---------------------------------------------------------------------
-- 12. TASK_ACTIVITY (auditoria leve)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.user_profiles(id),
  action VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_activity_task ON public.task_activity(task_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 13. TRIGGERS — updated_at automático
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_boards_updated ON public.boards;
CREATE TRIGGER trg_boards_updated
  BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated ON public.tasks;
CREATE TRIGGER trg_tasks_updated
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_task_comments_updated ON public.task_comments;
CREATE TRIGGER trg_task_comments_updated
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 14. TRIGGER — auto-criar user_profile no signup
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
DECLARE
  default_tenant_id UUID;
BEGIN
  SELECT id INTO default_tenant_id
  FROM public.tenants
  WHERE slug = 'hd-interna';

  INSERT INTO public.user_profiles (id, tenant_id, email, full_name, role)
  VALUES (
    NEW.id,
    default_tenant_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'member'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- 15. TRIGGER — auto-adicionar criador como owner do board
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_creator_as_owner() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.board_members (board_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner')
  ON CONFLICT (board_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_board_add_owner ON public.boards;
CREATE TRIGGER trg_board_add_owner
  AFTER INSERT ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_owner();

-- ---------------------------------------------------------------------
-- 16. HELPER: is_board_member (SECURITY DEFINER para evitar recursão de RLS)
--
-- Evita que policies em board_members consultem board_members causando
-- loops infinitos com RLS habilitado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_board_member(_board_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE board_id = _board_id
      AND user_id  = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_board_admin(_board_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE board_id = _board_id
      AND user_id  = _user_id
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_board_owner(_board_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.board_members
    WHERE board_id = _board_id
      AND user_id  = _user_id
      AND role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------
-- 17. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
ALTER TABLE public.tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_columns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_labels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity      ENABLE ROW LEVEL SECURITY;

-- ----- tenants -----
DROP POLICY IF EXISTS "tenants_authenticated_read" ON public.tenants;
CREATE POLICY "tenants_authenticated_read" ON public.tenants
  FOR SELECT TO authenticated
  USING (true);

-- ----- user_profiles -----
DROP POLICY IF EXISTS "user_profiles_self_read" ON public.user_profiles;
CREATE POLICY "user_profiles_self_read" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_profiles_self_update" ON public.user_profiles;
CREATE POLICY "user_profiles_self_update" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----- boards -----
DROP POLICY IF EXISTS "boards_member_read" ON public.boards;
CREATE POLICY "boards_member_read" ON public.boards
  FOR SELECT TO authenticated
  USING (public.is_board_member(id, auth.uid()));

DROP POLICY IF EXISTS "boards_authenticated_create" ON public.boards;
CREATE POLICY "boards_authenticated_create" ON public.boards
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "boards_admin_update" ON public.boards;
CREATE POLICY "boards_admin_update" ON public.boards
  FOR UPDATE TO authenticated
  USING (public.is_board_admin(id, auth.uid()))
  WITH CHECK (public.is_board_admin(id, auth.uid()));

DROP POLICY IF EXISTS "boards_owner_delete" ON public.boards;
CREATE POLICY "boards_owner_delete" ON public.boards
  FOR DELETE TO authenticated
  USING (public.is_board_owner(id, auth.uid()));

-- ----- board_members -----
DROP POLICY IF EXISTS "board_members_self_read" ON public.board_members;
CREATE POLICY "board_members_self_read" ON public.board_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_board_member(board_id, auth.uid())
  );

DROP POLICY IF EXISTS "board_members_admin_manage" ON public.board_members;
CREATE POLICY "board_members_admin_manage" ON public.board_members
  FOR ALL TO authenticated
  USING (public.is_board_admin(board_id, auth.uid()))
  WITH CHECK (public.is_board_admin(board_id, auth.uid()));

-- ----- board_columns / labels / tasks (acesso via board) -----
DROP POLICY IF EXISTS "board_columns_via_board" ON public.board_columns;
CREATE POLICY "board_columns_via_board" ON public.board_columns
  FOR ALL TO authenticated
  USING (public.is_board_member(board_id, auth.uid()))
  WITH CHECK (public.is_board_member(board_id, auth.uid()));

DROP POLICY IF EXISTS "labels_via_board" ON public.labels;
CREATE POLICY "labels_via_board" ON public.labels
  FOR ALL TO authenticated
  USING (public.is_board_member(board_id, auth.uid()))
  WITH CHECK (public.is_board_member(board_id, auth.uid()));

DROP POLICY IF EXISTS "tasks_via_board" ON public.tasks;
CREATE POLICY "tasks_via_board" ON public.tasks
  FOR ALL TO authenticated
  USING (public.is_board_member(board_id, auth.uid()))
  WITH CHECK (public.is_board_member(board_id, auth.uid()));

-- ----- task_labels / comments / attachments / activity (via task → board) -----
DROP POLICY IF EXISTS "task_labels_via_task" ON public.task_labels;
CREATE POLICY "task_labels_via_task" ON public.task_labels
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_labels.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_labels.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "task_comments_via_task" ON public.task_comments;
CREATE POLICY "task_comments_via_task" ON public.task_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "task_attachments_via_task" ON public.task_attachments;
CREATE POLICY "task_attachments_via_task" ON public.task_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "task_activity_via_task" ON public.task_activity;
CREATE POLICY "task_activity_via_task" ON public.task_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_activity.task_id
        AND public.is_board_member(t.board_id, auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 18. STORAGE — bucket privado para anexos
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "task_attachments_read" ON storage.objects;
CREATE POLICY "task_attachments_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "task_attachments_upload" ON storage.objects;
CREATE POLICY "task_attachments_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

DROP POLICY IF EXISTS "task_attachments_update" ON storage.objects;
CREATE POLICY "task_attachments_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'task-attachments' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'task-attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS "task_attachments_delete" ON storage.objects;
CREATE POLICY "task_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND owner = auth.uid());

-- ---------------------------------------------------------------------
-- 19. Recarregar schema cache do PostgREST
-- (lição aprendida do PCP Control: evita "column not found in schema cache")
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
