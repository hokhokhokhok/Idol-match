import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "막간",
    short_name: "막간",
    description: "뮤지컬·연극 공연, 배우, 혜택을 한곳에서. 내 관극 기록까지.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#8b1e3f",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
