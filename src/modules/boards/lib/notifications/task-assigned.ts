/**
 * Notifica o responsável por e-mail (Resend) quando uma tarefa lhe é atribuída.
 * O destino é o e-mail de cadastro: {@link resolveAssigneeCadastroEmail}.
 *
 * Variáveis: `RESEND_API_KEY`, opcional `NOTIFICATIONS_EMAIL_FROM`,
 * `NEXT_PUBLIC_APP_URL` para o link "Abrir tarefas".
 */

type NotifyPayload = {
  boardId: string;
  boardName: string;
  taskId: string;
  taskTitle: string;
  taskDescription: string | null;
  assigneeEmail: string;
  assigneeName: string | null;
  creatorName: string | null;
};

function buildBoardUrl(boardId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  return `${base}/boards/${boardId}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function notifyTaskAssigned(
  payload: NotifyPayload
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.NOTIFICATIONS_EMAIL_FROM?.trim() ??
    "ERP HD Soluções <onboarding@resend.dev>";

  if (!resendKey) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[notify] E-mail não enviado: defina RESEND_API_KEY e, se quiser, NOTIFICATIONS_EMAIL_FROM."
      );
    }
    return;
  }

  const subject = `[${payload.boardName}] Nova tarefa: ${payload.taskTitle}`;
  const link = buildBoardUrl(payload.boardId);
  const by = payload.creatorName ?? "Um colega";
  const descBlock = payload.taskDescription?.trim()
    ? `<p style="margin:12px 0;"><strong>Descrição</strong></p><div style="white-space:pre-wrap;border-left:3px solid #0f766e;padding-left:12px;">${escapeHtml(payload.taskDescription.trim())}</div>`
    : "";

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1e293b;">
      <p>Olá${payload.assigneeName ? ` ${escapeHtml(payload.assigneeName)}` : ""},</p>
      <p><strong>${escapeHtml(by)}</strong> atribuiu-lhe uma tarefa no projeto <strong>${escapeHtml(payload.boardName)}</strong>.</p>
      <p style="font-size:1.1em;"><strong>${escapeHtml(payload.taskTitle)}</strong></p>
      ${descBlock}
      <p style="margin-top:20px;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Abrir tarefas</a></p>
      <p style="font-size:12px;color:#64748b;">ERP HD Soluções Industriais — notificação automática (e-mail de cadastro).</p>
    </body>
    </html>
  `.trim();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.assigneeEmail],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[notify] Resend:", res.status, txt);
    }
  } catch (e) {
    console.warn("[notify] Falha ao enviar e-mail:", e);
  }
}
