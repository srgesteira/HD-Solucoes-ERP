import {
  buildPurchaseOrderEml,
  emlFilenameForPo,
} from "@/modules/compras/lib/purchasing/build-purchase-order-eml";
import { fmtPoBRL, fmtPoDate } from "@/modules/compras/lib/purchasing/purchase-order-display";

export type OpenPurchaseOrderEmailDraftArgs = {
  orderId: string;
  poNumber: string;
  supplierEmail?: string | null;
  supplierName?: string | null;
  orderDate?: string | null;
  expectedDelivery?: string | null;
  total?: number | null;
};

export type OpenPurchaseOrderEmailDraftResult = {
  mode: "share" | "eml";
  pdfFilename: string;
  emlFilename: string;
};

function poPdfFilename(poNumber: string): string {
  return `pedido-${poNumber.replace(/[^\w.\-/]+/g, "_")}.pdf`;
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

function buildEmailBody(args: OpenPurchaseOrderEmailDraftArgs): string {
  const lines = [
    "Prezado(a) fornecedor,",
    "",
    `Segue em anexo o pedido de compra n.º ${args.poNumber}.`,
  ];
  if (args.supplierName?.trim()) {
    lines.push(`Fornecedor: ${args.supplierName.trim()}`);
  }
  if (args.orderDate) {
    lines.push(`Data do pedido: ${fmtPoDate(args.orderDate)}`);
  }
  if (args.expectedDelivery) {
    lines.push(`Previsão de entrega: ${fmtPoDate(args.expectedDelivery)}`);
  }
  if (args.total != null && Number.isFinite(args.total)) {
    lines.push(`Total: ${fmtPoBRL(args.total)}`);
  }
  lines.push("", "Atenciosamente,");
  return lines.join("\n");
}

async function fetchOrderPdf(orderId: string): Promise<Blob> {
  const res = await fetch(`/api/purchasing/orders/${orderId}/pdf`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? "Erro ao gerar PDF do pedido");
  }
  return res.blob();
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

export type OpenPurchaseOrderEmailDraftOptions = {
  /** PDF já gerado (ex.: a partir da pré-visualização de impressão). */
  pdfBlob?: Blob | null;
};

/** Web Share no Windows não lista Zoho Mail desktop. */
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

export function purchaseOrderEmailDraftHint(
  result: OpenPurchaseOrderEmailDraftResult
): string {
  if (result.mode === "share") {
    return "Partilha de e-mail aberta com o PDF em anexo.";
  }

  return [
    `Ficheiro ${result.emlFilename} descarregado (pasta Downloads).`,
    "Abra-o com duplo-clique — o Zoho Mail deve abrir o rascunho com o PDF já anexado.",
    "Se não abrir sozinho: clique com o botão direito → Abrir com → Zoho Mail.",
  ].join(" ");
}

/**
 * Prepara e-mail com PDF anexado.
 * - Desktop: ficheiro .eml (RFC 822) com PDF embutido → Zoho Mail abre com anexo.
 * - Telemóvel: Web Share com ficheiros.
 */
export async function openPurchaseOrderEmailDraft(
  args: OpenPurchaseOrderEmailDraftArgs,
  options?: OpenPurchaseOrderEmailDraftOptions
): Promise<OpenPurchaseOrderEmailDraftResult> {
  const blob = options?.pdfBlob ?? (await fetchOrderPdf(args.orderId));
  const pdfFilename = poPdfFilename(args.poNumber);
  const file = new File([blob], pdfFilename, { type: "application/pdf" });
  const body = buildEmailBody(args);
  const subject = `Pedido de compra ${args.poNumber}`;

  if (shouldUseWebShareWithFiles(file)) {
    await navigator.share({
      title: subject,
      text: body,
      files: [file],
    });
    return {
      mode: "share",
      pdfFilename,
      emlFilename: emlFilenameForPo(args.poNumber),
    };
  }

  const attachmentBase64 = await blobToBase64(blob);
  const emlContent = buildPurchaseOrderEml({
    to: args.supplierEmail,
    subject,
    body,
    attachmentFilename: pdfFilename,
    attachmentBase64,
  });
  const emlFilename = emlFilenameForPo(args.poNumber);
  const emlBlob = new Blob([emlContent], {
    type: "message/rfc822;charset=utf-8",
  });

  downloadBlob(emlBlob, emlFilename);
  tryOpenEmlInMailClient(emlBlob);

  return {
    mode: "eml",
    pdfFilename,
    emlFilename,
  };
}
