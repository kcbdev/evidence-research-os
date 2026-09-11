import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // PBI-005: standalone output for the Coolify Docker deploy.
  output: "standalone",
};

export default nextConfig;
