import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Low-memory build tuning for shared hosting (cPanel): the production
  // build was hitting SIGABRT (OOM) during static generation. These are
  // Next.js-supported knobs — no app behavior changes.
  experimental: {
    // Frees webpack module buffers after each build pass (Next 15.2+).
    webpackMemoryOptimizations: true,
    // Render static pages through a single worker instead of forking one
    // per core; pages below the threshold stay in the main process.
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 100,
  },
};

export default nextConfig;
