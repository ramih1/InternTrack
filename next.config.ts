import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Resume uploads are capped at 4 MB in the app; leave room for multipart overhead.
      // (Vercel functions accept request bodies up to 4.5 MB.)
      bodySizeLimit: "4.4mb",
    },
  },
};

export default nextConfig;
