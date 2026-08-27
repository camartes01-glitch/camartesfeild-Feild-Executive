import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR === "1";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.cursor.sh",
    "*.cursor.com",
    "*.trycloudflare.com",
    "*.loca.lt",
  ],
  ...(isCapacitor
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
