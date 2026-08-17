import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@norberia/agentlens-core"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
