/// <reference types="vite-plugin-pwa/vanillajs" />
import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

// The service worker, new builds, and installing. Under `npm run dev` the plugin's module registers nothing.

type InstallPrompt = Event & { prompt(): Promise<unknown> };

declare global {
  const __FXBOT_VERSION__: string;
}
export const pageVersion = __FXBOT_VERSION__;

let waiting = false;
let registered: ServiceWorkerRegistration | undefined;
let installPrompt: InstallPrompt | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

// A new build's worker installs and then waits, so an open page keeps its whole build until the owner reloads. The
// page looks for a new build hourly, and whenever it comes back to the front.
const update = registerSW({
  onNeedRefresh() {
    waiting = true;
    changed();
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    registered = registration;
    const check = () => registration.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
  },
});

export const useNewVersion = () => useSyncExternalStore(subscribe, () => waiting);

// The open chat's draft crosses the reload in sessionStorage, and that chat takes it back.
let draft = { bot: "", text: "" };
export function keepDraft(bot: string, text: string) {
  draft = { bot, text };
}
export function takeDraft(bot: string) {
  const text = sessionStorage.getItem(`draft:${bot}`) ?? "";
  sessionStorage.removeItem(`draft:${bot}`);
  return text;
}

export function reload() {
  if (draft.text) sessionStorage.setItem(`draft:${draft.bot}`, draft.text);
  // The new worker reloads the pages it takes over. A page no worker controls yet, as on its first visit, reloads itself.
  if (navigator.serviceWorker?.controller) void update();
  else void update().then(() => location.reload());
}

// A server that names another version than this page's was updated: look for its build now, rather than within the
// hour, so the sidebar offers Reload. Each new version is asked about once.
let asked = pageVersion;
export async function serverVersion(version: string) {
  if (version === asked) return;
  asked = version;
  await registered?.update().catch(() => {});
}

// After an update from Settings: the new build's worker once it waits, or a plain reload, as under npm run dev.
export async function reloadNow() {
  await registered?.update().catch(() => {});
  for (let i = 0; registered && !waiting && i < 50; i++) await new Promise((done) => setTimeout(done, 100));
  if (waiting) reload();
  else location.reload();
}

// Chrome and Edge fire beforeinstallprompt once the app can install, and Settings offers an Install button. Safari on
// iOS has no prompt, so Settings shows the steps instead. An installed app shows neither.
addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as InstallPrompt;
  changed();
});
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
export const standalone = matchMedia("(display-mode: standalone)").matches;

export function useInstall() {
  const prompt = useSyncExternalStore(subscribe, () => installPrompt);
  if (standalone) return undefined;
  return prompt ? "prompt" : ios ? "steps" : undefined;
}

// A prompt can be shown only once.
export function install() {
  void installPrompt?.prompt();
  installPrompt = undefined;
  changed();
}
