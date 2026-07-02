import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "aamofkqdmqtpnqdxximh.supabase.co" },
    ],
  },
};

export default nextConfig;
