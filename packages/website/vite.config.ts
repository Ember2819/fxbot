import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// The path the site is served under, such as /fxbot/ beside other sites on one domain. Default /.
const base = `/${process.env.FXBOT_SITE_BASE ?? ""}/`.replace(/\/+/g, "/");

// The client side of the site: the page template, its CSS, and a small script. build.ts renders the pages into it.
export default defineConfig({
  base,
  // No fallback to index.html, so `npm run preview -w @fxbot/website` answers a missing page with 404.
  appType: "mpa",
  plugins: [tailwindcss()],
  build: { outDir: "../../out", emptyOutDir: true },
  // Loopback only; `tailscale serve` can show it on the tailnet, whose names end in .ts.net.
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, allowedHosts: [".ts.net"] },
});
