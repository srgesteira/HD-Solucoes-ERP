# API dos robôs — contrato

Fonte única para o ERP e o n8n não divergirem. Fase 4 (governança). Sem OpenAPI.

## Autenticação

| Forma | Header | Observação |
| --- | --- | --- |
| Token do robô (novo) | `Authorization: Bearer hdr_...` | Um por robô. O banco guarda só o hash. Revogar invalida na hora. |
| Chave antiga (transição) | `Authorization: Bearer <AGENT_API_KEY>` + `x-robo: <slug>` | Continua valendo até todos os robôs terem token. Sem `x-robo`, a ação fica sem robô no log. |

Travas aplicadas no servidor para robô identificado (token ou `x-robo`):

| Trava | Resposta | Log |
| --- | --- | --- |
| Robô pausado | 423 | `recusado` |
| Fora da janela (`agents.window_start`–`window_end`, horário de São Paulo) | 403 | `recusado` |
| Limite de ações por hora (`agents.max_actions_per_hour`, conta `ok` + `erro` da última hora) | 429 | `recusado` |

Leituras (`GET /api/audit`, `GET /api/agents`) e o heartbeat não obedecem janela nem limite.

## Módulo C — log (`agent_audit_log`)

### `POST /api/audit`
```json
{ "acao": "resumo_8h", "situacao": "ok", "entrada": {}, "resultado": {}, "duracao_ms": 1200,
  "erro": null, "ator": "robo", "aprovacao_id": null, "robo": "auditor" }
```
- `situacao`: `ok` | `erro` | `ignorado` (`recusado` só o servidor grava). Com `erro`, o campo `erro` é obrigatório.
- `ator`: `robo` | `claude`.
- `robo`: só usado com a chave antiga, quando não vier `x-robo`.
- Campos com cara de segredo (senha, token, chave, api_key, authorization...) são removidos antes de gravar.
- Resposta `201 { ok, id, robo }`.

### `GET /api/audit`
`?robo=auditor&desde=2026-11-22&situacao=erro,recusado&limite=100`
- `desde`: `AAAA-MM-DD` (meia-noite de São Paulo) ou ISO. Padrão: últimas 24 h. `limite` máx. 500.
- Robô ou administrador logado.
- Resposta `{ desde, total, itens: [{ id, quando, robo, ator, acao, situacao, duracao_ms, erro, entrada, resultado, aprovacao_id }], resumo: { por_robo: { auditor: { ok: 3 } } } }`.

## Módulo D — registro (`agents`)

### `GET /api/agents`
Robô ou administrador. `{ total, robos: [{ slug, nome, funcao, status, janela, dentro_da_janela_agora, limite_por_hora, acoes_ultima_hora, ultimo_sinal, tem_token_proprio, token_trocado_em }] }`.

### `POST /api/agents/{slug}` — só administrador logado
- `{ "acao": "pausar" }` — killswitch.
- `{ "acao": "retomar" }`
- `{ "acao": "novo_token" }` — devolve `token` **uma vez**; o anterior deixa de valer.

Tudo grava em `agent_audit_log` com `ator = diretor`.

## Heartbeat

`POST /api/agent/heartbeat` `{ "robo": "n8n", "info": {} }` — token ou chave antiga. Atualiza `robot_heartbeats` e `agents.last_seen_at`.

## Robôs cadastrados (migration `20261123110000`)

`n8n`, `auditor`, `supervisor`, `recepcionista`, `financeiro`, `cobrador`, `pcp`, `notificador`, `prospector` (ativos) · `faturista`, `comprador`, `anotacoes`, `carteira` (pausados até a Fase 5).

## Alerta financeiro do ERP (Ordem 3)

`GET /api/alerts/finance-digest` (cron da Vercel 7h, seg–sex, ou sessão com acesso financeiro) grava em `agent_audit_log` uma linha `acao = alerta_financeiro`, robô `alertas_financeiros`, com `resultado = { colisao_caixa, hoje, amanha, entregas_venda_3d, chegadas_compra_3d, texto }`. Não manda mais Telegram. O Auditor das 8h lê com `GET /api/audit?robo=alertas_financeiros&limite=1`.

## Ainda por vir (Fase 4)

Fila de aprovações (`/api/approvals`), regra das 17h30/18h, banco de aprendizado (`/api/learning`).
