import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import type PDFDocumentType from "pdfkit";

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));

/** Caminho real das fontes .afm do pdfkit (pnpm / npm). */
export function resolvePdfKitDataDir(): string {
  const entry = nodeRequire.resolve("pdfkit");
  const base = path.dirname(entry);
  const candidates = [
    path.join(base, "data"),
    path.join(base, "js", "data"),
    path.join(process.cwd(), "node_modules", "pdfkit", "js", "data"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "Helvetica.afm"))) return dir;
  }
  throw new Error(
    "Fontes do PDFKit não encontradas. Execute pnpm install e reinicie o servidor."
  );
}

/** Carrega pdfkit sem passar pelo bundler (compatível com Next.js). */
export function loadPdfDocument(): typeof PDFDocumentType {
  return nodeRequire("pdfkit") as typeof PDFDocumentType;
}
