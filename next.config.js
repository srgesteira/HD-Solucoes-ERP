const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
