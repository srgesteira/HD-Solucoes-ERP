/** Baixa o PDF do orçamento gerado no servidor (sem janela de impressão). */
export async function downloadQuotePdf(quoteId: string): Promise<void> {
  const res = await fetch(`/api/sales/quotes/${quoteId}/pdf`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error ?? "Erro ao gerar PDF");
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(cd);
  const name = m?.[1] ?? "orcamento.pdf";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
