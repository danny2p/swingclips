import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.185', '192.168.1.111'],
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
