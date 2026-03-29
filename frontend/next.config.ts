import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8001/api/:path*",
      },
      // FedCompendium XL data files (CRA fetches from /data/)
      {
        source: "/data/:path*",
        destination: "/compendium/data/:path*",
      },
    ];
  },
};

export default nextConfig;
