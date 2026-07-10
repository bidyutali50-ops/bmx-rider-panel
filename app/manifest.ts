import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BM Xpress Rider",
    short_name: "BMX Rider",
    description:
      "Your earnings, wallet, payouts and attendance — BM Xpress Logistics.",
    start_url: "/rider",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c0f13",
    theme_color: "#f4570c",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
