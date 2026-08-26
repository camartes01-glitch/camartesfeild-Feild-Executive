import type { NextConfig } from "next";

const isCapacitor = process.env.CAPACITOR === "1";

const nextConfig: NextConfig = {
  ...(isCapacitor
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
