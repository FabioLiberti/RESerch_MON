import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
      // FedCompendium XL data files (CRA fetches from /data/)
      {
        source: "/data/:path*",
        destination: "/compendium/data/:path*",
      },
      // FedCompendium XL internal routes → serve index.html
      // so CRA reads the correct pathname on mount
      {
        source: "/topic/:id",
        destination: "/compendium/index.html",
      },
      {
        source: "/learning-path",
        destination: "/compendium/index.html",
      },
      {
        source: "/learning-path/:id",
        destination: "/compendium/index.html",
      },
    ];
  },
};

export default nextConfig;
