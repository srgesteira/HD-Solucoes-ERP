const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "unpdf", "pdf-parse", "@napi-rs/canvas"],
  /**
   * Não usar `output: "standalone"` aqui: na Vercel o passo de cópia para
   * `.next/standalone` falha com rotas em grupos `(app)` (ENOENT no manifest).
   * Standalone fica para Docker/CI com `next.config.docker.js` ou variável à parte.
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/**",
      },
    ],
  },
  /**
   * Diz ao Next que a raiz do projeto é esta pasta — silencia o aviso de
   * "multiple lockfiles" quando há um package-lock.json antigo em ~/.
   */
  outputFileTracingRoot: __dirname,
  /**
   * Binário do Chromium serverless (@sparticuz/chromium/bin/*.br) é lido do
   * disco em runtime — o tracer não o detecta sozinho. Só nas rotas que geram PDF.
   */
  outputFileTracingIncludes: {
    "/api/purchasing/orders/[id]/pdf": [
      "./node_modules/.pnpm/pdfkit@*/node_modules/pdfkit/js/data/**",
      "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/purchasing/orders/[id]/email": [
      "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
    ],
    "/api/sales/quotes/[id]/send-email": [
      "./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**",
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

module.exports = nextConfig;
