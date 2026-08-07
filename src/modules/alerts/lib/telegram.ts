export type TelegramSendResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Envia uma mensagem via Telegram Bot API (sendMessage). Server-only:
 * lê TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID de process.env — nunca expor
 * com prefixo NEXT_PUBLIC_.
 */
export async function sendTelegramMessage(
  text: string
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      ok: false,
      error:
        "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID não configurados no ambiente.",
    };
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Telegram API ${res.status}: ${body}` };
  }

  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!json?.ok) {
    return { ok: false, error: json?.description ?? "Resposta inesperada da Telegram API." };
  }

  return { ok: true };
}
