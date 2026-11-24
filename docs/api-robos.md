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
- `{ "acao": "pausar" }` — killswitch. Só login, sem MFA, para parar rápido.
- `{ "acao": "retomar" }` — exige MFA recente.
- `{ "acao": "revogar" }` — apaga o token próprio; deixa de valer na hora. Exige MFA.
- `{ "acao": "novo_token" }` — devolve `token` **uma vez**; o anterior deixa de valer. Exige MFA.

Tudo grava em `agent_audit_log` com `ator = diretor`.

## Heartbeat

`POST /api/agent/heartbeat` `{ "robo": "n8n", "info": {} }` — token ou chave antiga. Atualiza `robot_heartbeats` e `agents.last_seen_at`.

## Robôs cadastrados (migration `20261123110000`)

`n8n`, `auditor`, `supervisor`, `recepcionista`, `financeiro`, `cobrador`, `pcp`, `notificador`, `prospector` (ativos) · `faturista`, `comprador`, `anotacoes`, `carteira` (pausados até a Fase 5) · `hd_central` (Claude; migration `20261124100000`) e `alertas_financeiros`.

## Alerta financeiro do ERP (Ordem 3)

`GET /api/alerts/finance-digest` (cron da Vercel 7h, seg–sex, ou sessão com acesso financeiro) grava em `agent_audit_log` uma linha `acao = alerta_financeiro`, robô `alertas_financeiros`, com `resultado = { colisao_caixa, hoje, amanha, entregas_venda_3d, chegadas_compra_3d, texto }`. Não manda mais Telegram. O Auditor das 8h lê com `GET /api/audit?robo=alertas_financeiros&limite=1`.

## MFA (tela de Aprovações e rotas do diretor)

MFA nativo do Supabase (TOTP, Google Authenticator). As rotas do diretor exigem sessão `aal2` com o código digitado há **no máximo 30 min** (`MFA_JANELA_MIN` em `src/modules/agent/lib/mfa.ts`). Sem isso: `401 { error, detail: { mfa: "necessario" | "expirado" } }`. Robô nunca passa por MFA (usa token).

## Matriz de risco (`src/modules/agent/lib/risk-matrix.ts`)

Fica em código; a IA nunca classifica. O robô manda a **chave da ação**, o servidor decide a classe:

| Classe | Ações (chave) | Como roda |
|---|---|---|
| baixo | `email.classificar`, `crm.atualizar`, `pedido.status_confirmado`, `financeiro.lancar_previsao`, `resposta.simples_sem_preco`, `prospeccao.modelo_aprovado` | automático, resumo das 8h |
| medio | `estoque.entrada_pc`, `financeiro.baixa_exata` | automático, avisa na hora |
| alto | `financeiro.baixa_divergente`, `comercial.preco_prazo_condicao`, `nfe.emitir`, `compra.pedido`, `financeiro.gasto_pagamento`, `envio.fora_do_padrao`, `pc.permissao_nova` | fila de aprovações |
| proibido | `seguranca.digitar_senha`, `seguranca.mudar_configuracao`, `email.instrucao_recebida` | só o diretor; entra na fila como `pergunta` |

Chave fora da tabela = **alto** até o diretor classificar (acrescentar no arquivo).

## Módulo B — fila de aprovações (`approvals`)

### `POST /api/approvals` — robô
```json
{ "acao": "nfe.emitir", "resumo": "Emitir NF do PV-2026-0031 (Cold Control, R$ 1.110,54)",
  "tipo": "nfe", "dados": { "pv": "PV-2026-0031" }, "origem_url": "https://…", "robo": "faturista" }
```
- `robo` só é preciso com a chave antiga; com token próprio o robô já é conhecido.
- `risco` sai da matriz. Ação baixo/médio é recusada (400): roda automático. Exceção: `tipo: "pergunta"`.
- Para `permissao_pc`, mande `dados.comando` (exato) e `dados.motivo`; a tela mostra os dois.
- Risco alto avisa o diretor por e-mail, só entre 07:00 e 17:30; fora disso vai no resumo das 8h.
- Resposta `201 { id, status, risco, tipo, expira_em, classe_na_matriz, fora_da_matriz, diretor_avisado }`.

### `GET /api/approvals?status=pendente|aprovado|rejeitado|expirado&desde=ISO&id=&limite=`
- Robô vê só os próprios pedidos; `auditor` e `supervisor` veem todos (resumo das 8h).
- Diretor: com MFA.
- Antes de ler, o que passou do prazo vira `expirado` (`fn_approvals_expire`).
- `{ total, expirados_agora, itens: [{ id, tipo, resumo, dados, origem_url, risco, status, robo, robo_nome, criado_em, expira_em, decidido_em, decidido_por, decidido_por_nome, observacao }] }`.
- O robô que pediu consulta `?id=` para saber se pode seguir: só executa com `status = aprovado`.

### `POST /api/approvals/decide` — diretor com MFA
`{ "ids": ["…"], "decisao": "aprovado" | "rejeitado", "nota": "opcional" }` → `{ decididos, itens, ignorados }`. Uma transação (`fn_approvals_decide`); decisão é definitiva; grava no log quem decidiu.

### `POST /api/approvals/{id}/decide` — diretor com MFA
`{ "decisao": "aprovado" | "rejeitado", "nota": "opcional" }`.

## Regra das 17h30 / 18h

- `/api/agent/mail` (POST), `/api/agent/prospeccao` (POST sem `dry_run`), `/api/agent/faturar` (`emitir`, `enviar`) e `/api/agent/comprador` (`emitir_pc`) recusam **robô** entre 17:30 e 07:00 (São Paulo): `403` + linha `recusado` no log. O diretor logado na tela não é barrado.
- Pedido pendente às 18h vira `expirado` (prazo em `approvals.expires_at`; criado depois das 18h vale até as 18h do dia seguinte). Volta no resumo das 8h: `GET /api/approvals?status=expirado&desde=<ontem 08:00>`.

## Módulo E — banco de aprendizado (`robot_learning`)

### `GET /api/learning?robo=comprador&contexto=fornecedor_item:<produto_id>&busca=&limite=`
- Robô: só regras **válidas** (confirmadas nos últimos 6 meses). Sem regra → pergunta.
- `contexto` aceita prefixo com `*` (ex.: `fornecedor_item:*`).
- Diretor (MFA): todas, `?todas=1` inclui as vencidas.
- `{ total, itens: [{ id, robo, contexto, pergunta_original, resposta_aprovada, fonte, risco, aprovacao_id, ultima_confirmacao, vence_em, valida }] }`.

### `POST /api/learning`
`{ "robo": "comprador", "contexto": "assunto:chave", "pergunta": "…", "resposta": { … }, "risco": "baixo", "aprovacao_id": null }`
- Robô: só o `hd_central` (Claude), com fonte `claude`. Risco alto exige `aprovacao_id` de pedido **aprovado**.
- Diretor (MFA): fonte `diretor`.
- `resposta` é objeto com a decisão (quem/qual), nunca texto copiado de e-mail.

### `PATCH /api/learning/{id}` · `DELETE /api/learning/{id}` — diretor com MFA
`{ "resposta": {…} }` edita; `{ "confirmar": true }` renova os 6 meses. `DELETE` apaga (o robô volta a perguntar).

### `POST /api/learning/carga` — diretor com MFA
Refaz "fornecedor de cada item" pelo histórico de PCs (`fn_robot_learning_seed_suppliers`; só atualiza com PC mais novo).

O Comprador (`GET /api/agent/comprador?pv=`) já consulta essas regras: item sem fornecedor preferido usa a regra válida e marca `fornecedor_por: "banco_de_aprendizado (…)"`; sem regra, `"perguntar"`.

## Tela `/aprovacoes` (celular)

Login + MFA. Abas: **Fila** (caixas de seleção, Aprovar/Rejeitar selecionados), **Histórico**, **Robôs** (pausar/retomar, gerar/trocar/revogar token) e **Regras** (buscar, confirmar, editar, apagar, refazer carga).
