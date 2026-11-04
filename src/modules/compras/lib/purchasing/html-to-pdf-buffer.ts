import fs from "node:fs";

/**
 * HTML → PDF via puppeteer-core.
 *
 * - Serverless (Vercel / AWS Lambda): usa o Chromium empacotado em
 *   `@sparticuz/chromium` (descompactado em /tmp na primeira chamada).
 * - Desenvolvimento local: usa Chrome/Edge instalado (ou CHROME_PATH).
 *
 * Usado pelo PDF do pedido de compra e do orçamento — ponto único de impressão.
 */

const LOCAL_BROWSERS = [
  process.env.CHROME_PATH,
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
].filter((p): p is string => Boolean(p?.trim()));

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV
  );
}

function findLocalBrowser(): string | null {
  for (const p of LOCAL_BROWSERS) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignora */
    }
  }
  return null;
}

type LaunchConfig = {
  executablePath: string;
  args: string[];
  headless: boolean | "shell";
};

async function resolveLaunchConfig(): Promise<LaunchConfig> {
  // CHROME_PATH explícito sempre vence (útil para testar/depurar).
  const local = process.env.CHROME_PATH?.trim() || (!isServerless() ? findLocalBrowser() : null);
  if (local) {
    return {
      executablePath: local,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
      headless: true,
    };
  }

  try {
    const { default: chromium } = await import("@sparticuz/chromium");
    chromium.setGraphicsMode = false;
    const executablePath = await chromium.executablePath();
    return {
      executablePath,
      args: [...chromium.args, "--font-render-hinting=none"],
      headless: "shell",
    };
  } catch (err) {
    const detail = err instanceof Error ? ` (${err.message})` : "";
    throw new Error(
      `Navegador para gerar o PDF não disponível${detail}. Em ambiente local, instale o Google Chrome ou defina CHROME_PATH.`
    );
  }
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const config = await resolveLaunchConfig();
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: config.executablePath,
    headless: config.headless,
    args: config.args,
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
    await browser.close().catch(() => undefined);
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
