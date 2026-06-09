/** Gera PDF no browser a partir do mesmo HTML da pré-visualização de impressão. */

export type GeneratePurchaseOrderPdfClientOptions = {
  element: HTMLElement;
  filename: string;
};

export async function generatePurchaseOrderPdfBlob(
  options: GeneratePurchaseOrderPdfClientOptions
): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  const blob = await html2pdf()
    .set({
      margin: [10, 10, 16, 10],
      filename: options.filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    } as Record<string, unknown>)
    .from(options.element)
    .outputPdf("blob");

  return blob as Blob;
}
