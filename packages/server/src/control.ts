import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
export function requestUpdate(to: string) {
  const requests = join(folder!, "requests");
  mkdirSync(requests, { recursive: true });
  writeFileSync(join(requests, ".update.json"), JSON.stringify({ to }));
  renameSync(join(requests, ".update.json"), join(requests, "update.json"));
}
