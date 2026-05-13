import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@resvg/resvg-js'],
};

export default withWorkflow(nextConfig);
