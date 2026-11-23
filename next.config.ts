import type { NextConfig } from "next";

// NETSIM_PAGES=1 builds a static copy for GitHub Pages (npm run pages:check, and the Pages
// workflow). NETSIM_BASE_PATH is where Pages serves it: "/<your repo's name>".
const pages = process.env.NETSIM_PAGES === "1";

const nextConfig: NextConfig = pages
  ? {
      output: "export",
      basePath: process.env.NETSIM_BASE_PATH ?? "",
      trailingSlash: true,
      images: { unoptimized: true },
      // Lets the page know it's the Pages build: /board then starts on your in-page machine.
      env: { NEXT_PUBLIC_NETSIM_PAGES: "1" },
    }
  : {
      // No Next.js dev badge (the "N" in the corner): it sat on the live dashboard's canvas, in the
      // studio's Visualizer and in demos. Build errors still show in the overlay.
      devIndicators: false,
    };

export default nextConfig;
