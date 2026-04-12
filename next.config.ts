import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Support local network testing via ALLOWED_ORIGINS env var in .env.local
  // @ts-ignore
  allowedDevOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ["localhost:3000"],
  async headers() {
    return [
      {
        // Explicitly set MIME type for WASM files if the host is misconfigured
        source: "/ffmpeg/:path*.wasm",
        headers: [
          {
            key: "Content-Type",
            value: "application/wasm",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
