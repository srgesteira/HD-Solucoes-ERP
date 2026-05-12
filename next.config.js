const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Saída standalone (Docker / hospedagem com imagem Node). Na Vercel o builder
   * usa o fluxo próprio; esta opção não atrapalha o deploy serverless.
   */
  output: "standalone",
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
  turbopack: {
    root: path.resolve(__dirname),
  },
};

module.exports = nextConfig;
