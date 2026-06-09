import fs from "node:fs";
import path from "node:path";

const WINDOWS_BROWSERS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter((p): p is string => Boolean(p?.trim()));

function findBrowserExecutable(): string | null {
  for (const p of WINDOWS_BROWSERS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error(
      "Chrome ou Edge não encontrado para gerar o PDF. Instale o Google Chrome ou defina CHROME_PATH."
    );
  }

  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "16mm", left: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function remoteImageAsDataUrl(url: string): Promise<string | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;
  try {
    const res = await fetch(trimmed);
    if (!res.ok) return trimmed;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return trimmed;
  }
}
