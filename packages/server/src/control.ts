import type { LocalEmbedder } from "@fxbot/sdk";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// The running version, and updates in an install made by setup.sh. fxbot runs in a container there and never holds the
// podman or docker socket: it writes a request into its control folder (FXBOT_CONTROL), and the machine's fxbot command
// (deploy/fxbot) carries it out and writes its steps to status.json. A checkout updates with git.

const root = resolve(import.meta.dirname, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; repository?: string | { url: string } };
export const version = manifest.version;
export const repository = typeof manifest.repository === "string" ? manifest.repository : (manifest.repository?.url ?? "");

const folder = process.env.FXBOT_CONTROL;
export const canUpdate = Boolean(folder);

// What the machine wrote about the last update: `back` means the new release didn't start and the old one runs again.
export type UpdateRun = { to: string; state: "working" | "done" | "failed" | "back"; steps: string[]; error?: string };

export function lastUpdate(): UpdateRun | null {
  try {
    return JSON.parse(readFileSync(join(folder!, "status.json"), "utf8")) as UpdateRun;
  } catch {
    return null;
  }
}

// The request the machine hasn't taken yet, if any.
export function waiting(): string | null {
  try {
    return (JSON.parse(readFileSync(join(folder!, "requests", "update.json"), "utf8")) as { to?: string }).to ?? null;
  } catch {
    return null;
  }
}

// Written under a dot name and renamed: systemd ignores names that start with a dot, so it sees only a whole request.
function request(name: string, body: unknown) {
  const requests = join(folder!, "requests");
  mkdirSync(requests, { recursive: true });
  writeFileSync(join(requests, `.${name}`), JSON.stringify(body));
  renameSync(join(requests, `.${name}`), join(requests, name));
}
export const requestUpdate = (to: string) => request("update.json", { to });

// The machine's local embedder for memory search: what it runs, from its embedder-status.json (the CPU until it says
// otherwise), and a switch it hasn't finished, or why one failed.
export function localEmbedder(): { embedder: LocalEmbedder; switching: { to: LocalEmbedder; error?: string } | null } {
  const asked = join(folder!, "requests", "embedder.json");
  let run: { embedder?: LocalEmbedder; state?: string; to?: LocalEmbedder; error?: string } = {};
  try {
    run = JSON.parse(readFileSync(join(folder!, "embedder-status.json"), "utf8"));
  } catch {}
  const embedder = run.embedder ?? "cpu";
  // The machine may take the request between the check and the read.
  try {
    if (existsSync(asked)) return { embedder, switching: { to: (JSON.parse(readFileSync(asked, "utf8")) as { to: LocalEmbedder }).to } };
  } catch {}
  if (run.state === "working" && run.to) return { embedder, switching: { to: run.to } };
  if (run.state === "failed" && run.to) return { embedder, switching: { to: run.to, ...(run.error ? { error: run.error } : {}) } };
  return { embedder, switching: null };
}
export const requestEmbedder = (to: LocalEmbedder) => request("embedder.json", { to });
