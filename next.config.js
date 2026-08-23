/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal self-contained server bundle (.next/standalone) with
  // only the node_modules actually used at runtime — required for a lean
  // Docker image instead of shipping the full node_modules tree.
  output: "standalone",

  // `docx` ships as an ESM package; without this Next's webpack build treats
  // it as an opaque external and can't statically resolve its named exports
  // (Paragraph, TextRun, etc.), failing the production build.
  transpilePackages: ["docx"],

  /**
   * Experimental features configuration.
   * serverComponentsExternalPackages: packages that use native Node.js modules
   * (like sharp and formidable) must be excluded from server component bundling
   * so Next.js loads them from node_modules at runtime rather than bundling them.
   */
  experimental: {
    serverComponentsExternalPackages: ["sharp", "formidable", "@prisma/client"],
  },

  /**
   * Image configuration.
   * Allows serving images from the local filesystem via the /api/uploads route.
   * No external image domains are required since all images are stored locally.
   */
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
