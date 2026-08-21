/** @type {import('next').NextConfig} */
const nextConfig = {
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
