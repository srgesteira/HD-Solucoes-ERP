declare module "html2pdf.js" {
  interface Html2PdfChain {
    set(options: Record<string, unknown>): Html2PdfChain;
    from(element: HTMLElement): Html2PdfChain;
    outputPdf(type: "blob"): Promise<Blob>;
  }

  function html2pdf(): Html2PdfChain;
  export default html2pdf;
}
