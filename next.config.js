/** @type {import('next').NextConfig} */
const nextConfig = {
    // Produces a minimal self-contained server bundle (.next/standalone) with
    // only the node_modules actually used at runtime — required for a lean
    // Docker image instead of shipping the full node_modules tree.
    // To enable: set BUILD_STANDALONE=1 before running npm run build.
    output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,

    /**
     * Experimental features configuration.
     * serverComponentsExternalPackages: packages excluded from server-component
     * bundling so Next.js loads them from node_modules at runtime via Node's
     * resolver instead of webpack. Used for:
     *  - native Node modules (sharp, formidable)
     *  - Prisma's generated client
     *  - `docx`: an ESM-only package whose bundled index.mjs exposes named
     *    exports (Paragraph, TextRun, Document, ...) in a form webpack's
     *    static analysis can't resolve, producing dozens of "Attempted import
     *    error: 'X' is not exported from 'docx'" warnings. Externalizing it
     *    (docx is only ever imported by the server route /api/export) lets Node
     *    resolve the named exports natively at runtime, eliminating the
     *    warnings without a runtime cost.
     */
    experimental: {
        serverComponentsExternalPackages: ["sharp", "formidable", "@prisma/client", "docx"],
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
