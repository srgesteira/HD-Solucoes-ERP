# Envio de orçamentos pelo Zoho Mail (API)

O botão **Enviar / Reenviar** do orçamento abre um modal de confirmação (destinatário,
cópia, assunto e corpo editáveis). Só depois de clicar em **Confirmar e enviar** o ERP:

1. obtém um *access token* a partir do *refresh token* (fica em cache na memória até expirar);
2. gera o PDF do orçamento (mesma função de PDF usada na impressão);
3. envia o anexo para o Zoho (`POST /api/accounts/{accountId}/messages/attachments?uploadType=multipart`);
4. envia o e-mail (`POST /api/accounts/{accountId}/messages`, formato HTML) — ele fica
   também na pasta **Enviados** da caixa helder@hdindustrial.ind.br;
5. só com o envio confirmado pelo Zoho: status do orçamento passa a **Enviado**,
   `send_count` + 1 e o envio (data/hora, destinatários, assunto) fica no log de auditoria.

Se as variáveis abaixo **não** estiverem configuradas, o botão continua funcionando como
antes (SMTP da empresa / Resend / envio simulado) e o modal mostra o aviso
**"Zoho não configurado"**.

---

## 1. Criar o Self Client no Zoho API Console

1. Entre em <https://api-console.zoho.com> com a conta **helder@hdindustrial.ind.br**
   (a mesma conta que vai enviar os e-mails).
2. Clique em **Add Client** → escolha **Self Client** → **Create** → confirme com **OK**.
3. Na aba **Client Secret**, copie o **Client ID** e o **Client Secret**.
   Guarde-os em local seguro (gerenciador de senhas); não mande por e-mail/WhatsApp.

## 2. Escopos necessários

| Escopo | Para quê |
|---|---|
| `ZohoMail.messages.CREATE` | Enviar o e-mail **e** fazer o upload do anexo (a documentação do Zoho aceita `CREATE` ou `ALL` para os dois endpoints) |
| `ZohoMail.accounts.READ` | Descobrir o `accountId` automaticamente (GET `/api/accounts`). Dispensável se você preencher `ZOHO_ACCOUNT_ID`, mas recomendado |

**Não é preciso** `ZohoMail.messages.ALL` (dá acesso de leitura/apagar a todas as mensagens —
mais permissão do que o ERP precisa). Se um dia o upload do anexo devolver erro de escopo,
aí sim gere um novo código incluindo `ZohoMail.messages.ALL`.

## 3. Gerar o código e trocar pelo refresh token

1. Ainda no Self Client, aba **Generate Code**:
   - **Scope:** `ZohoMail.messages.CREATE,ZohoMail.accounts.READ`
   - **Time Duration:** 10 minutes
   - **Scope Description:** `ERP HD - envio de orçamentos`
   - **Create** → copie o código gerado (vale só pelos minutos escolhidos e é de uso único).
2. Em até 10 minutos, troque o código pelo refresh token (terminal do Windows/PowerShell
   com `curl.exe`, ou Git Bash). Substitua os três valores:

```bash
curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=SEU_CLIENT_ID" \
  -d "client_secret=SEU_CLIENT_SECRET" \
  -d "code=CODIGO_GERADO"
```

   No PowerShell use `curl.exe` e tudo numa linha (sem as barras `\`).

3. A resposta tem este formato:

```json
{
  "access_token": "1000.xxxx",
  "refresh_token": "1000.yyyy",
  "api_domain": "https://www.zohoapis.com",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

   Copie o **`refresh_token`** — é ele que vai para a Vercel. Ele não expira sozinho
   (só se for revogado em <https://accounts.zoho.com> → Sessions/Connected Apps, ou se a
   senha/segurança da conta for alterada). O `access_token` pode ser descartado: o ERP gera
   um novo a cada hora.

   Se vier `{"error":"invalid_code"}`, o código expirou ou já foi usado — gere outro.

> **Data center:** a conta da HD está em `zoho.com`. Se algum dia a conta estiver em outro
> data center (ex.: `zoho.eu`, `zoho.in`), use o domínio correspondente no comando acima
> (`https://accounts.zoho.eu/...`) e ajuste `ZOHO_ACCOUNTS_DOMAIN` / `ZOHO_MAIL_DOMAIN`.

## 4. (Opcional) Descobrir o accountId

Não é obrigatório — sem `ZOHO_ACCOUNT_ID` o ERP chama `GET /api/accounts` e escolhe a conta
cujo endereço é `ZOHO_FROM_ADDRESS`. Para fixar manualmente (economiza uma chamada):

```bash
curl "https://mail.zoho.com/api/accounts" \
  -H "Authorization: Zoho-oauthtoken ACCESS_TOKEN_DA_RESPOSTA_ACIMA"
```

Use o campo `accountId` da resposta.

## 5. Variáveis na Vercel

Vercel → projeto do ERP → **Settings** → **Environment Variables**. Cadastre em
**Production** (e em **Preview** só se quiser testar envios reais em preview):

| Variável | Obrigatória | Valor |
|---|---|---|
| `ZOHO_CLIENT_ID` | sim | Client ID do Self Client |
| `ZOHO_CLIENT_SECRET` | sim | Client Secret do Self Client (marque como *Sensitive*) |
| `ZOHO_REFRESH_TOKEN` | sim | `refresh_token` do passo 3 (marque como *Sensitive*) |
| `ZOHO_FROM_ADDRESS` | sim | `helder@hdindustrial.ind.br` |
| `ZOHO_ACCOUNT_ID` | não | `accountId` do passo 4 (se vazio, é descoberto automaticamente) |
| `ZOHO_ACCOUNTS_DOMAIN` | não | padrão `https://accounts.zoho.com` |
| `ZOHO_MAIL_DOMAIN` | não | padrão `https://mail.zoho.com` |

Depois de salvar, faça **Redeploy** (as variáveis só valem para deploys novos).

Para desenvolvimento local, as mesmas variáveis vão no `.env.local` (nunca commitar).

## 6. Teste

1. Abra um orçamento em rascunho → **Enviar**.
2. O modal deve mostrar **De: helder@hdindustrial.ind.br (Zoho Mail)** e os campos
   Destinatário, Cópia, Assunto e Corpo. Se aparecer **"Zoho não configurado"**, falta
   alguma variável obrigatória (ou o redeploy).
3. Envie primeiro para um e-mail seu, confira o PDF anexo e a pasta Enviados do Zoho.

Erros do Zoho aparecem como aviso vermelho na tela (ex.: `invalid_client`, `INVALID_OAUTHTOKEN`,
erro de escopo) e o orçamento **não** muda de status.
