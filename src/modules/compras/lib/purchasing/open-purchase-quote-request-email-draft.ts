import {
  buildPurchaseOrderEml,
  emlFilenameForPo,
} from "@/modules/compras/lib/purchasing/build-purchase-order-eml";
import { fmtPoDate } from "@/modules/compras/lib/purchasing/purchase-order-display";

export type OpenPurchaseQuoteRequestEmailDraftArgs = {
  requestId: string;
  requestNumber: string;
  requestDate?: string | null;
  needDate?: string | null;
  message?: string | null;
};

export type OpenPurchaseQuoteRequestEmailDraftResult = {
  mode: "share" | "eml";
  pdfFilename: string;
  emlFilename: string;
};

function pdfFilename(requestNumber: string): string {
  return `orcamento-compra-${requestNumber.replace(/[^\w.\-/]+/g, "_")}.pdf`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function tryOpenEmlInMailClient(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    URL.revokeObjectURL(url);
  } else {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}

function buildEmailBody(args: OpenPurchaseQuoteRequestEmailDraftArgs): string {
  const intro =
    args.message?.trim() ||
    "Solicito cotação dos itens abaixo, com prazo de entrega e condições de pagamento.";
  const lines = [
    "Prezado(a) fornecedor,",
    "",
    intro,
    "",
    `Segue em anexo a solicitação de orçamento n.º ${args.requestNumber}.`,
  ];
  if (args.requestDate) {
    lines.push(`Data da solicitação: ${fmtPoDate(args.requestDate)}`);
  }
  if (args.needDate) {
    lines.push(`Data de necessidade: ${fmtPoDate(args.needDate)}`);
  }
  lines.push("", "Atenciosamente,");
  return lines.join("\n");
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Falha ao ler o PDF."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Falha ao ler o PDF."));
    reader.readAsDataURL(blob);
  });
}

function shouldUseWebShareWithFiles(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return false;
  if (!navigator.canShare({ files: [file] })) return false;

  const ua = navigator.userAgent;
  const isMobile =
    /Android|iPhone|iPad|iPod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && /Mobile/i.test(ua));
  return isMobile;
}

export function purchaseQuoteRequestEmailDraftHint(
  result: OpenPurchaseQuoteRequestEmailDraftResult
): string {
  if (result.mode === "share") {
    return "Escolha a app de e-mail e o destinatário — o PDF vai em anexo.";
  }
  return `Abra o ficheiro ${result.emlFilename} no seu cliente de e-mail, escolha o(s) destinatário(s) e envie.`;
}

export async function openPurchaseQuoteRequestEmailDraft(
  args: OpenPurchaseQuoteRequestEmailDraftArgs,
  options?: { pdfBlob?: Blob | null }
): Promise<OpenPurchaseQuoteRequestEmailDraftResult> {
  const pdfName = pdfFilename(args.requestNumber);
  const pdfBlob = options?.pdfBlob;
  if (!pdfBlob) {
    throw new Error("PDF da solicitação não encontrado.");
  }

  const subject = `Solicitação de orçamento n.º ${args.requestNumber}`;
  const body = buildEmailBody(args);
  const pdfFile = new File([pdfBlob], pdfName, { type: "application/pdf" });

  if (shouldUseWebShareWithFiles(pdfFile)) {
    await navigator.share({
      files: [pdfFile],
      title: subject,
      text: body,
    });
    return { mode: "share", pdfFilename: pdfName, emlFilename: "" };
  }

  const base64 = await blobToBase64(pdfBlob);
  const eml = buildPurchaseOrderEml({
    to: null,
    subject,
    body,
    attachmentFilename: pdfName,
    attachmentBase64: base64,
  });
  const emlName = emlFilenameForPo(`orcamento-${args.requestNumber}`).replace(
    /^pedido-/,
    "orcamento-compra-"
  );
  const emlBlob = new Blob([eml], { type: "message/rfc822" });
  downloadBlob(emlBlob, emlName);
  tryOpenEmlInMailClient(emlBlob);

  return { mode: "eml", pdfFilename: pdfName, emlFilename: emlName };
}
