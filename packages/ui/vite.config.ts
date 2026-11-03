import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { VitePWA, type ManifestOptions } from "vite-plugin-pwa";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const { version } = JSON.parse(readFileSync(`${repo}package.json`, "utf8")) as { version: string };
// The development API's port. A release that setup.sh installs takes 8787, so both can run on one machine.
const apiPort = process.env.FXBOT_PORT ?? "8788";

// `npm run dev` runs the API beside Vite, and restarts it when the server or the SDK changes. Vite on its own watches
// only this package, so it is told to watch those two as well. Its watcher drives the restarts too: Node's
// --watch-path missed a second edit to a file that an editor had replaced. The API outlives a Vite restart.
function api(): Plugin {
  return {
    name: "fxbot-api",
    apply: "serve",
    configureServer(server) {
      const dirs = ["sdk", "server"].map((name) => `${repo}packages/${name}/src/`);
      server.watcher.add(dirs);
      const running = ((globalThis as { fxbotApi?: ReturnType<typeof runApi> }).fxbotApi ??= runApi());
      server.watcher.on("all", (_event, file) => {
        if (!dirs.some((dir) => file.startsWith(dir))) return;
        server.config.logger.info(`restarting the API: ${file.slice(repo.length)} changed`, { timestamp: true });
        running.restart();
      });
    },
  };
}

// The API as a child process, stopped when Vite exits. A restart lets the old one finish and free the port first,
// and a change after a crash starts it again.
function runApi() {
  let child: ChildProcess | undefined;
  let restarting = false;
  const start = () => {
    // The port is given, so .env cannot point the API away from the proxy below.
    child = spawn(process.execPath, ["--env-file-if-exists=.env", "packages/server/src/index.ts"], { cwd: repo, env: { ...process.env, FXBOT_PORT: apiPort }, stdio: ["ignore", "inherit", "inherit"] });
    child.once("exit", () => {
      child = undefined;
      if (restarting) (restarting = false), start();
    });
  };
  start();
  process.once("exit", () => child?.kill());
  return {
    restart() {
      if (!child) return start();
      if (restarting) return;
      restarting = true;
      child.kill("SIGTERM");
    },
  };
}

const manifest: Partial<ManifestOptions> = {
  id: "/",
  name: "fxbot",
  short_name: "fxbot",
  description: "Long-running chats with your bots",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  // The icons are opaque, and the bubble stays inside the circle that maskable icons keep, so each serves as both.
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

// The page that `npm run dev` serves is the app the owner installs, so it links the same manifest. It registers no
// service worker, so every change shows up as it lands. The offline copy is the production build's (`npm run prod`).
function devManifest(): Plugin {
  return {
    name: "fxbot-dev-manifest",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_req, res) => {
        res.setHeader("content-type", "application/manifest+json");
        res.end(JSON.stringify(manifest));
      });
    },
    transformIndexHtml: () => [{ tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" }],
  };
}

export default defineConfig({
  // The page knows the version it was built from, to notice a server that runs another.
  define: { __FXBOT_VERSION__: JSON.stringify(version) },
  plugins: [
    api(),
    devManifest(),
    react(),
    tailwindcss(),
    VitePWA({
      // A new build's worker waits for src/pwa.ts to ask it to take over, so an open page never mixes two builds.
      registerType: "prompt",
      injectRegister: false,
      manifest,
      // The shell is precached. /api, and /callback where a sign-in on this machine lands, are never answered by the worker.
      workbox: { globPatterns: ["**/*.{js,css,html,woff2}"], navigateFallbackDenylist: [/^\/api\//, /^\/callback(\?|$)/] },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    // IPv4 loopback, like the API server, so `tailscale serve 5173` reaches it. Tailnet names end in .ts.net.
    host: "127.0.0.1",
    // Fail rather than move to another port, which `tailscale serve 5173` would not reach.
    strictPort: true,
    allowedHosts: [".ts.net"],
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${apiPort}`,
        // Plugins' sockets (fx.socket) are WebSockets under /api.
        ws: true,
        // Vite's proxy keeps the page's stream open after the API server stops. Close it too, so the chat sees the drop.
        configure: (proxy) => proxy.on("proxyRes", (upstream, _req, res) => upstream.on("close", () => upstream.complete || res.destroy())),
      },
    },
  },
});
