import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped here when a parent directory also contains a lockfile.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
