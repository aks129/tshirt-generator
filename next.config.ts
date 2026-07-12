import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@resvg/resvg-js'],
  // Bundle the OFL fonts into every serverless function that rasterizes SVG —
  // Vercel has no system fonts, so resvg renders <text> as nothing without
  // these (see lib/images/rasterize.ts).
  outputFileTracingIncludes: {
    '/**': ['./assets/fonts/**'],
  },
};

export default withWorkflow(nextConfig);
