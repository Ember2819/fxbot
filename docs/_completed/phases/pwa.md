# PWA

v1 meant fxbot to install as a PWA, and on a phone it doesn't. The parts exist: a manifest, icons, and a service worker that precaches the shell. They only reach the production build, though, which nothing in daily use serves, and they were never checked on a phone. This phase makes the tailnet address a real app:
- it installs on Android, iOS, and desktop
- it opens offline
- it takes updates without running stale code
- it looks native, with theme colors, safe areas, and the keyboard handled

Status: built on 2026-11-01, and checked in Chromium on this machine against disposable databases and ports: 44 checks, all passing (section 4). Phones are still to be tried by hand. After the build, the owner chose to install the development page: `npm run dev` keeps the plain tailnet address, and `npm run prod` is the production build on its own port. Where the build differs from the plan, section 3 says so under **Built**. It changed the UI (the Vite config, `index.html`, a small `pwa.ts`, and class names in three components), one server line, the root `package.json`, the README, and `AGENTS.md`, with nothing in `@fxbot/sdk`. Updating fxbot itself is the [releases](releases.md) phase; this page covers the page noticing a new build.

## 1. Research

These are read from the repository at `41a9e66`, specs, docs, and source, as of November 2026.

**What v1 built, and why it isn't an app**
- **What exists.** `vite-plugin-pwa` 2.0.0 writes a manifest and a Workbox service worker that precaches the shell and never touches `/api` (`packages/ui/vite.config.ts`).
  - The manifest has `fxbot`, `standalone`, `start_url: /`, white colors, and 192 and 512 pixel PNG icons.
- **What v1 checked.** "Chromium reports no installability errors for the production build", on this machine. Its "Not checked" list includes "Safari, iOS, Firefox, … a real install prompt, a browser on another device" (`docs/_completed/v1-plan.md`).
- **Development has no PWA.** The owner runs `npm run dev`, with `tailscale serve` pointing `/` at `127.0.0.1:5173`.
  - The plugin leaves development alone unless `devOptions.enabled` is set ("Should the service worker be available on development?", `@default false`).
  - So that page has no manifest and no worker, and Android's Chrome can't install it. iOS 26 can still open it from the Home Screen as a web app, but with neither the manifest's icons nor an offline shell.
- **The built app is out of reach.** It exists only after `npm run build`. Then `npm run server`, or the API that `npm run dev` now starts, serves it on 8787, where `tailscale serve` doesn't point.
- **Updates don't reach an open app.** The config has `registerType: "autoUpdate"` but imports no `virtual:pwa-register`. The plugin's guide says that then "any client tab/window will not be reloaded (the old service worker will be still controlling the application)". An app left open on a phone keeps running old code.
- **Looks.**
  - The theme color is always `#ffffff`, but the app follows `prefers-color-scheme`, with a dark background of `oklch(0.145 0 0)` (`index.css`).
  - Only the composer pads for `env(safe-area-inset-bottom)`.
  - No icon is marked `maskable`. The icon itself is opaque out to its corners (`#171717`), and its bubble stays within 34% of the width from the center.
- **Serving.** The server sends each built file with `cache-control: no-cache`. It knows `.html`, `.js`, `.css`, `.webmanifest`, `.png`, and `.svg`, so the precached `.woff2` font goes out as `application/octet-stream`.

**Install rules by platform**
- **Chrome** ([install criteria](https://web.dev/articles/install-criteria)). Before it offers an install, the app must:
  - not be installed already
  - have had the user click or tap the page at least once, and view it for 30 seconds or more
  - be served over HTTPS
  - have a manifest with `name` or `short_name`, a 192px and a 512px icon, `start_url`, and a `display` of `fullscreen`, `standalone`, `minimal-ui`, or `window-controls-overlay`
  - not set `prefer_related_applications: true`
  - The list has no service worker requirement.
- **Android's install sheet.** With `description` and `screenshots` in the manifest, "on Android only, these values will be shown in the install prompt" ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)).
- **Safari 26** ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
  - "By default, every website added to the Home Screen opens as a web app", unless the user turns off "Open as Web App" when adding it.
  - "there are now zero requirements for 'installability' in Safari", and "If you define your icons in the manifest, they're used". Safari also takes SVG icons wherever it shows one.
- **iOS push and badges** ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). A Home Screen web app can ask for push permission only "in response to direct user interaction". Its pushes come from `*.push.apple.com`, and it can "support the Badging API".
- **Maskable icons** ([web.dev](https://web.dev/articles/maskable-icon)). What matters must sit "within a circular area in the center of the icon with a radius equal to 40% of the icon width".
- **Page metadata** (MDN).
  - `<meta name="theme-color">` takes a `media` attribute, so light and dark can differ.
  - The viewport's `interactive-widget=resizes-content` means "The viewport gets resized by the interactive widget", such as the keyboard.
  - The `display-mode` media feature tells a standalone app from a browser tab.
  - `beforeinstallprompt` lets the page show its own install button, which calls `prompt()`.

**vite-plugin-pwa 2.0** (installed; [guide](https://vite-pwa-org.netlify.app/guide/))
- **Prompting** is the default `registerType`. `onNeedRefresh` tells the page about a new build, and "When the user clicks the 'refresh' button when onNeedRefresh called, then call updateSW()".
- **Periodic checks.** The guide calls `registration.update()` on an interval, hourly in its example. Otherwise a page that never navigates checks only when it opens.
- **Development.** A development worker precaches a single entry, the `navigateFallback`, so it can't open offline.

**References**
- **opencode's web app** (`packages/app/vite.pwa.ts`, `manifest.json`, and `src/entry.tsx`, at `9a611d3`).
  - It sets `registerType: "prompt"`, and registers its worker itself, only in production.
  - `skipWaiting` and `clientsClaim` are `false`, to "Keep each open tab on its complete build until all old clients close".
  - Each precache entry carries a sha256 integrity hash, which "rejects mixed deployments".
  - Its manifest sets `id`, `scope`, and `start_url` to `/`, and lists each icon twice, as `any` and as `maskable`.
  - Its Playwright suite checks that "the production build installs as an app behind an authenticating proxy" (`e2e/service-worker/cache.spec.ts`).
- **The research directive's projects.** No clone of them here ships a manifest or a service worker, and Grok Bot's docs don't describe installing it.

**Tailscale**
- `tailscale serve --https=<port>` serves another HTTPS port on the same machine name (`tailscale serve --help`).
- A port is part of an origin. So `https://<machine>.<tailnet>.ts.net` and `…:8443` keep separate service workers and storage.

## 2. Key takeaways

1. **The installed app is the built app, at its own address.** *Reversed after the build: the owner installs the development page (see **Built**).*
   - The plain tailnet address (443) goes to 8787, the API serving `packages/ui/dist`.
   - Development moves to 8443, which goes to Vite on 5173.
   - The two origins never share a service worker, so the dev server can't disturb the installed app, and Vite needs no development worker.
2. **One command runs the app.** `npm start` builds, then serves. `npm run dev` starts the same API, which serves the last build, so the phone app keeps working during development. *Built as `npm run prod`.*
3. **Updates are offered, never forced.**
   - An open app stays on its whole build until the owner taps Reload.
   - It checks for a new build hourly, and whenever it comes to the front.
   - The draft survives the reload.
4. **Small changes make it installable everywhere:**
   - `id`, `scope`, and `description` in the manifest
   - the icons marked `maskable` too, since they already fit the safe zone
   - light and dark theme colors
   - safe areas on every edge
   - a keyboard that resizes the page
   - the font's type
5. **Each platform gets its install path.** Android and desktop Chrome get an Install button, and iOS gets the steps. An installed app shows neither.
6. **Push notifications and badges wait for their own phase.** They need VAPID keys sealed on the server, stored subscriptions, and worker code, and on iOS they only work from the Home Screen. Nothing here blocks them: the generated worker can import a push handler later.

## 3. Implementation

### Two addresses

As built, the development page keeps the plain address and is the app to install. The plan had them the other way round (see **Built**).

| Address | Serves | One-time command |
| --- | --- | --- |
| `https://<machine>.<tailnet>.ts.net` | `npm run dev`: Vite on 5173, the app to install | `tailscale serve --bg 5173` |
| `https://<machine>.<tailnet>.ts.net:8443` | Optional. `npm run prod`: the API and the built page, on 8787 | `tailscale serve --bg --https=8443 8787` |

- The root `package.json` gets `npm run prod`: `npm run build && npm run server`.
- The README's run section describes both addresses, and says to install from the first.
- Vite's `allowedHosts` already admits `.ts.net`, and its hot reload follows the page's port.

### Manifest and icons (`packages/ui/vite.config.ts`)

```ts
manifest: {
  id: "/",
  name: "fxbot",
  short_name: "fxbot",
  description: "Long-running chats with your bots",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
},
```

- **Icons.** The current ones stay. They're opaque, and the bubble fits the 40% safe zone. `index.html` keeps `apple-touch-icon` for iOS before 26.
- **Theme colors.** `index.html` gets two theme colors, `<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">` and the same for dark with `#0a0a0a`, `index.css`'s dark `--background`.
- **The keyboard.** The viewport gains `interactive-widget=resizes-content`, so Android's keyboard resizes the page and the composer stays above it.
- **The server.** It learns `.woff2` as `font/woff2`.

### Updates (`packages/ui/src/pwa.ts`)

- **The worker waits.** `registerType: "prompt"` and `injectRegister: false`, with `skipWaiting` and `clientsClaim` left `false`, as opencode does. A new worker installs, then waits, and the open page keeps its whole build.
- **Registration.** `main.tsx` calls `registerSW` from `virtual:pwa-register` in production builds only.
  - `onNeedRefresh` sets a flag. The sidebar footer then shows "New version" with a Reload button, built from the existing Button, with no new component.
  - `onRegisteredSW` calls `registration.update()` every hour, and when `visibilitychange` brings the app back to the front.
- **Reload** saves the open chat's draft text to `sessionStorage`, then calls `updateSW()`. The chat puts the draft back after the reload. A streaming reply survives a reload already (v1).
- **Old pages and a new server.** A page left on an old build can meet a newer API. This phase only offers the newer page; [releases](releases.md) closed the gap, since the page now hears the server's version on each answer and looks for its build at once.

### Looking native (`index.css`, `app.tsx`)

- **Safe areas.** With `viewport-fit=cover`, which `index.html` already sets:
  - the header and sidebar pad `env(safe-area-inset-top)`
  - the left and right edges pad their insets
  - the composer keeps its bottom inset
- **Install, in Settings.** A small row, about 30 lines in `pwa.ts`:
  - **Chrome and Edge,** once `beforeinstallprompt` fires: an **Install** button that calls `prompt()`.
  - **Safari on iOS:** the steps, Share and then Add to Home Screen, with "Open as Web App" left on.
  - **Already installed** (`display-mode: standalone`): no row.

### Where the code goes

- **`packages/ui`:**
  - `vite.config.ts`: the manifest, prompt mode, and the manifest served in development
  - `index.html`: theme colors and viewport
  - `index.css` and `app.tsx`: safe areas and the Reload row
  - `pwa.ts`: registration, update checks, the draft handoff, and the install row
- **`packages/server`:** the `.woff2` type.
- **The root `package.json` and README:** `npm run prod`, and the two addresses.

### Built

What the build found or changed, checked against vite-plugin-pwa 2.0.0 and Playwright's Chromium:

- **The owner installs the development page.** The planned addresses meant a rebuild and a Reload after every change, while the owner runs `npm run dev` over Tailscale as agents build. So they swapped:
  - `npm run dev` keeps the plain tailnet address, and its page is the app to install. A small Vite plugin serves the same manifest in development and links it.
  - That page registers no service worker, so every change shows up as it lands. Chrome needs no worker to install, and Chromium reports no installability errors for the page.
  - `npm start` became `npm run prod`: the production build on 8787, which can take :8443. It keeps the offline shell and the Reload prompt.
  - The installed development page can't open while the server is down.
  - The production build stays off the plain address, where its service worker would answer for the development page.
- **Registration lives in `pwa.ts`, which `app.tsx` imports,** not in `main.tsx`. It registers as the module loads, so its `beforeinstallprompt` listener is in place before Chrome fires one. It needs no production check: under `npm run dev` the plugin's `virtual:pwa-register` is a stub that registers nothing.
- **The rows' markup is in `app.tsx`.** `pwa.ts` has no JSX. It holds the state (`useNewVersion`, `useInstall`) and the actions (`reload`, `install`, and the draft's `keepDraft` and `takeDraft`).
- **Prompt mode needs no Workbox options.** The plugin turns on `skipWaiting` and `clientsClaim` only for `autoUpdate`. The generated worker calls `skipWaiting()` only when the page sends `SKIP_WAITING`, which `updateSW()` does.
- **Safe areas reach a few more places than planned:**
  - the library page's header and the bot panel's tabs pad the top inset, like the chat's header
  - the sidebar footer pads the bottom inset, and the sidebar paints its own color under the left one
  - the page drops its left inset while the sidebar sits beside it
- **Headless Chromium offered to install by itself** on `127.0.0.1`. It fired a real `beforeinstallprompt`, and Settings showed Install before the check dispatched its own.
- **On a phone the sidebar is a sheet,** so "New version" shows once the sheet is opened, as planned.

### Size

Built: about 130 lines, against the estimate of 130. It adds no dependency and no process.

| Part | Estimate | Built |
| --- | --- | --- |
| `pwa.ts` | 60 | 72 |
| UI: the Reload row, the install row, the draft, and safe areas | 45 | +30 in `app.tsx`, and one class each in `library.tsx` and `bot-panel.tsx` |
| Config, HTML, and CSS | 25 | +27 in `vite.config.ts`, with the manifest served in development, and +1 in `index.html`. `index.css` needed nothing |
| Server and scripts | 3 | +1 and +1 |

Plus the README.

## 4. Checklist

Checks run the production build on a disposable port and database, with Playwright's Chromium on this machine. Phones are the human's. The update checks build A and B in a copy of the repository, so the real build only ever holds the current code.

**M1. Installs**
- [x] `npm run prod` (planned as `npm start`) builds and serves the app. The API that `npm run dev` starts serves the same build.
- [x] The development page links the same manifest and registers no worker. Chromium reports no installability errors for it either.
- [x] The manifest comes as `application/manifest+json` with `id`, `scope`, `description`, and both icons as `any` and `maskable`. Chromium reports no installability errors (`Page.getInstallabilityErrors`).
- [x] The font comes as `font/woff2`.
- [x] In dark mode, the dark theme color applies. It matches the page's dark background, read back as `#0a0a0a`.

**M2. Offline and updates**
- [x] With the server stopped, the cached shell opens and says it can't reach the server, as in v1.
- [x] Build A and open it, then build B. A visibility change brings up "New version".
  - The page keeps running A, and no request mixes A's page with B's files. A plain reload still opens A while B waits.
  - Reload runs B.
- [x] A draft typed before Reload is still there after it. A later visit to that chat starts empty.
- [x] A development page on another port leaves the production worker alone.

**M3. Install row and looks**
- [x] A dispatched `beforeinstallprompt` shows Install, and clicking it calls `prompt()`.
- [x] An iOS user agent shows the steps. Standalone display shows no row. Chromium would not emulate `display-mode`, so this check answers `matchMedia` for it.
- [x] `npm run typecheck`, `npm run build`, and `git diff --check` pass.

**Also checked,** with Chromium's safe-area emulation:
- Upright, with a 59-pixel status bar and a 34-pixel home indicator: the chat's header, the sidebar's top and bottom rows, and the bot panel's tabs clear both, and the composer pads 34 pixels.
- Turned, with 59-pixel insets at both sides: the sidebar takes the left inset and the page the right one. With the sidebar closed, the page takes both.
- No page errors in any view.

**The human runs these:**
- Keep `tailscale serve` 443 on 5173. For the production build, add 8443 for 8787.
- **Android Chrome:** install from the tailnet address, and check:
  - the icon's shape, and the colors in light and dark
  - the composer stays above the keyboard
  - a change to the code shows up in the app
  - at :8443, "New version" appears after a rebuild, and the app opens in airplane mode
- **iPhone on iOS 26:** Add to Home Screen with "Open as Web App" on. The status bar and the home indicator don't cover the header or the composer. Repeat the update and offline checks at :8443.
- **Desktop Chrome:** install from the address bar.

## 5. Open questions

Each has a default. The build took every one, and then the owner answered the first the other way.

1. **Which address gets the app.** *Default:* the plain tailnet address for the app, and :8443 for development. The other way round works too, with the app on :8443. *Answered:* the plain address stays on development, which is the app to install, and the production build takes :8443.
2. **Push notifications and badges.** "Bob replied", and a count of unread chats on the icon. *Default:* a later phase of its own, with VAPID keys sealed on the server like every other secret.
3. **Screenshots for Android's install sheet.** *Default:* none for now. Two can be added later, with `form_factor` set.
4. **A worker in development.** *Default:* none. A development worker would cache only the entry page. It stayed none after the development page became the one to install, since Chrome installs it without one.
5. **Keeping the server running.** *Default:* no service, as now. With the server down, the installed development page can't open, while the production build opens its shell and says so.
