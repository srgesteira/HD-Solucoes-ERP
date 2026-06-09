const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["puppeteer-core"],
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
  outputFileTracingIncludes: {
    "/api/purchasing/orders/[id]/pdf": [
      "./node_modules/pdfkit/js/data/**",
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

module.exports = nextConfig;
