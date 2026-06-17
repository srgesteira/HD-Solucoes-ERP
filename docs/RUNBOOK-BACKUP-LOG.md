# Log de validação de backup e continuidade

Registo de testes de recuperação e smoke pós-backup, conforme [`RUNBOOK-BACKUP-E-INCIDENTES.md`](./RUNBOOK-BACKUP-E-INCIDENTES.md) §2.1.

| Data | Tipo | Executado por | Resultado |
|------|------|---------------|-----------|
| 2026-06-17 | Smoke automatizado produção (`pnpm test:smoke:full`) | Agente Cursor | **55/55 OK** — DB, APIs, HVAC V1–V5, scripts unitários |
| 2026-06-17 | Plano macro §12.5 automatizado (`pnpm test:smoke:plan`) | Agente Cursor | Ver saída do script — frentes 1–7, P1, páginas, fiscal (0 regras 🧑‍💼) |
| 2026-06-17 | Restore completo → projeto `staging-restore` | — | **Pendente** — requer painel Supabase + confirmação Helder (operacao destrutiva num clone) |

## Próxima acção humana (restore mensal real)

1. Supabase → Database → Backups → selecionar snapshot.
2. Restaurar num **projeto secundário** (nunca sobrescrever produção sem incidente).
3. Apontar `SMOKE_BASE_URL` para o URL do clone.
4. Correr `pnpm test:smoke:all`.
5. Actualizar esta tabela com data, snapshot ID e OK/Falha.

## Smoke manual browser (Helder)

Checklist: [`DECISAO-VERTICAL-HVAC.md`](./DECISAO-VERTICAL-HVAC.md) passos 1–8 + frentes 1–7 em [`GUIA-EXECUCAO-CURSOR.md`](./GUIA-EXECUCAO-CURSOR.md).
