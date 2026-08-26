import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  // PDF/DOCX rider extraction runs only on the Node.js server.
  // Keep these parsers external so Vercel packages their runtime files intact.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
