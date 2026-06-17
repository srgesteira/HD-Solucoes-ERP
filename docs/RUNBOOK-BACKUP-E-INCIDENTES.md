# Runbook · Backup, recuperação e plano de incidente

> §15 do documento funcional. Este runbook é a única fonte de verdade
> operacional para "o que fazer quando algo dá errado". Mantenha curto,
> testável e atualizado. Se um passo aqui virar mentira, atualize antes
> da próxima auditoria.

---

## 1. Inventário do que precisa ser protegido

| Camada | O que é | Onde fica | Quem fica responsável |
| --- | --- | --- | --- |
| Banco de dados | Postgres do Supabase (todos os tenants) | Supabase (managed) | Tech lead + Supabase |
| Storage | Buckets (logos, PDFs de orçamento, anexos NF-e, BOM PDFs) | Supabase Storage | Tech lead |
| Código | Repositório Git | Hosting Git (origin) | Tech lead |
| Variáveis de ambiente | `.env.production` | Vault interno + Vercel/Supabase | Tech lead |
| Configuração FocusNFe | Token + ambiente por tenant | `company_settings.focusnfe_token` | Tech lead |

> Regra de ouro: se algo não está nesta tabela, não está protegido. Nada
> que vive só no laptop do Helder está coberto.

---

## 2. Política de backup

### 2.1 Banco de dados

- **Frequência mínima**: snapshot automático diário (Supabase) +
  PITR (point-in-time recovery) habilitado.
- **Retenção**: 30 dias para snapshots automáticos. Backup mensal
  exportado externamente (dump SQL para storage offline).
- **Validação**: 1× por mês, restaurar o último backup num projeto
  Supabase secundário ("staging-restore") e rodar smoke test
  (`pnpm test:smoke` se disponível, ou abrir 3 telas críticas).
- **Quem testa**: tech lead. Marca a data e resultado em
  `docs/RUNBOOK-BACKUP-LOG.md` (criar quando o primeiro teste rodar).

### 2.2 Storage (buckets Supabase)

- Cada bucket exporta semanalmente para um destino externo (S3
  compatível ou similar). Script `scripts/backup-storage.sh`
  (criar) usa Service Role + `supabase storage download`.
- Retenção: 90 dias. Logos antigos podem ser podados depois.

### 2.3 Código e configuração

- Git principal hospedado em GitHub/GitLab; branch `main` protegida.
- Sem commits diretos em `main` — sempre PR com revisão.
- `.env.production` nunca é commitado. Cópia criptografada vive no
  vault da equipe.
- Migrations vivem em `supabase/migrations/` e são versionadas.

---

## 3. RTO e RPO objetivo

- **RTO (Recovery Time Objective)**: 4 horas para restauração total.
- **RPO (Recovery Point Objective)**: ≤ 24 horas (snapshot diário) ou
  ≤ 5 minutos (PITR, se contratado).

Esses números são compromissos com o cliente. Mudanças exigem
atualização explícita aqui antes de comunicar.

---

## 4. Procedimentos de recuperação

### 4.1 Restaurar banco de dados (snapshot)

1. Abrir o painel Supabase do projeto.
2. Em "Database → Backups", selecionar o snapshot desejado.
3. Clicar "Restore". Confirmar.
4. Aguardar (Supabase indica progresso).
5. Após restore, rodar `pnpm db:check` (criar se não existir;
   por enquanto: testar login + carregar /onboarding e /data-health
   sem erros).
6. Notificar usuários por e-mail interno usando template
   `templates/incident-restored.md` (criar quando primeiro
   incidente acontecer).

### 4.2 Restaurar uma tabela só (recuperação cirúrgica)

1. Use PITR para um momento "antes do erro".
2. Restaure num projeto secundário ("rescue-YYYYMMDD").
3. Exporte a(s) tabela(s) que precisa: `pg_dump --table public.X`.
4. Importe no projeto principal: `psql -f X.sql`.
5. Confirme contagem antes/depois.

> Nunca faça TRUNCATE/DELETE para "limpar" antes de importar sem
> auditoria. Use `BEGIN; ... ROLLBACK;` ou `BEGIN; ... COMMIT;` num
> bloco controlado e revisado.

### 4.3 Restaurar storage (anexo apagado)

1. Identificar o bucket e path original na audit_log.
2. Ir até o bucket externo de backup (S3 ou similar).
3. Baixar a versão mais recente do arquivo.
4. Upload de volta ao Supabase Storage no mesmo path.
5. Notificar quem pediu.

### 4.4 Reverter código a um estado conhecido

1. `git log --oneline` para localizar último commit estável.
2. Criar branch `hotfix/rollback-<data>`.
3. `git revert <hash>` para desfazer commits problemáticos.
4. Abrir PR, revisar com outra pessoa, mergeear.
5. Pipeline implanta.

> Nunca `git push --force` em `main`.

---

## 5. Plano de incidente

### 5.1 Severidades

| Sev | Critério | SLA de resposta |
| --- | --- | --- |
| **SEV-1** | Sistema inacessível para todos os tenants OU corrupção de dados financeiros/fiscais | Resposta em 15 min, comunicação a cada 30 min |
| **SEV-2** | Funcionalidade crítica quebrada para 1 tenant (ex.: NF-e bloqueada) ou para todos (ex.: orçamento não salva) | Resposta em 1h, comunicação a cada 2h |
| **SEV-3** | Bug funcional sem perda de dado, contornável | Resposta em 1 dia útil |

### 5.2 Fluxo de resposta

1. **Quem detecta abre incidente** num canal único (Slack/Discord/
   Telegram interno) com tag `#incident`.
2. Designar **Incident Commander (IC)** — não precisa ser quem detectou.
   IC não codifica; IC coordena, comunica e cronometra.
3. IC abre uma issue no GitHub/Linear com template
   `templates/incident.md` (criar) e mantém histórico.
4. IC comunica o cliente (e-mail/WhatsApp dependendo do contrato)
   nos intervalos previstos pela severidade.
5. Resolver. Confirmar resolução com o usuário que reportou.
6. Em até 48h, IC redige o **postmortem** (template
   `templates/postmortem.md`, criar) — sem culpar pessoa, focar em
   processo. Linkar ao audit_log e ao commit/migration que causou.
7. Definir **action items** com data e responsável. Adicionar a
   este runbook se virar regra permanente.

### 5.3 Comunicação durante incidente

- Mensagem inicial obrigatória (em até 15 min para SEV-1):
  > "Identificamos um incidente afetando [funcionalidade].
  > Estamos investigando. Próxima atualização em [tempo]."
- Atualizações no SLA da severidade.
- Mensagem final:
  > "Incidente resolvido em [hora]. Causa: [resumo de 1 linha].
  > Postmortem completo em até 48h."

### 5.4 O que NUNCA fazer durante incidente

- Não `DROP`/`TRUNCATE` antes de backup.
- Não fazer migration "para arrumar" sem revisão de outra pessoa.
- Não comunicar "estamos quase resolvendo" se não estiver — comunique
  o que sabe, mesmo que seja "ainda investigando".
- Não desligar audit_log para "ganhar performance" — o histórico
  é o que viabiliza o postmortem.

---

## 6. Checklist trimestral

Marcar em `docs/RUNBOOK-BACKUP-LOG.md`:

- [ ] Restauração de banco testada (Q__)
- [ ] Restauração de storage testada (Q__)
- [ ] Inventário desta seção 1 ainda está correto
- [ ] RTO/RPO ainda corresponde ao contratado
- [ ] Templates `incident.md` e `postmortem.md` existem e são usados
- [ ] Pelo menos 1 simulação de incidente (game day) por semestre

---

## 7. Contatos de emergência

| Função | Pessoa | Contato |
| --- | --- | --- |
| Tech lead | Helder | (preencher) |
| Suporte Supabase | — | https://supabase.com/dashboard → Support |
| Suporte FocusNFe | — | suporte@focusnfe.com.br |
| Contadora (fiscal) | (preencher) | (preencher) |

---

> Última revisão: 2026-06-16. Próxima revisão obrigatória: 2026-09-16
> (trimestral). Se passou da data, este documento perdeu autoridade —
> reavalie antes de usar em incidente real.
