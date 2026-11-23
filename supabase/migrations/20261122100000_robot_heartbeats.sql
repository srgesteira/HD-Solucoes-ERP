-- Heartbeat dos robôs (Fase 3 do mapa de robôs).
-- O n8n chama POST /api/agent/heartbeat a cada 10 min; GET /api/status/n8n lê o último sinal
-- para o UptimeRobot avisar se o n8n parou. Uma linha por robô (hoje só 'n8n').
-- Só o servidor (service_role) lê e grava: RLS ligado e nenhuma policy.

CREATE TABLE IF NOT EXISTS public.robot_heartbeats (
  robot TEXT PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  info JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.robot_heartbeats ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.robot_heartbeats IS
  'Último sinal de vida de cada robô (n8n). Gravado por /api/agent/heartbeat, lido por /api/status/n8n.';
