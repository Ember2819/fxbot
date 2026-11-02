import type { Release } from "./types.ts";

// fxbot's versions and its releases. A version is x.y.z, with a prerelease such as rc.1 after a dash.
const pattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const day = 24 * 60 * 60 * 1000;

export const isVersion = (version: string) => pattern.test(version);
export const isStable = (version: string) => pattern.exec(version)?.[4] === undefined && isVersion(version);

// Below zero when a is older than b. A prerelease comes before its release.
export function compareVersions(a: string, b: string) {
  const x = pattern.exec(a);
  const y = pattern.exec(b);
  if (!x || !y) throw new Error(`${x ? b : a} is not a version`);
  for (const i of [1, 2, 3]) if (x[i] !== y[i]) return Number(x[i]) - Number(y[i]);
  if (x[4] === y[4]) return 0;
  if (x[4] === undefined) return 1;
  if (y[4] === undefined) return -1;
  return x[4].localeCompare(y[4], "en", { numeric: true });
}

// GitHub's newest stable release for a repository URL such as https://github.com/<owner>/fxbot.
export function releasesUrlFor(repository: string) {
  const found = /^(?:git\+)?https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repository);
  return found ? `https://api.github.com/repos/${found[1]}/${found[2]}/releases/latest` : undefined;
}

// Asks `url` for the newest stable release at start and once a day after. A failed check is silent, and the next day's
// tries again. The answer is shown, never run: updating is the owner's choice.
export function createReleases({ version, url, fetch }: { version: string; url?: string; fetch: typeof globalThis.fetch }) {
  let latest: Release | null = null;
  async function check() {
    try {
      const res = await fetch(url!, { headers: { accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return;
      const found = (await res.json()) as { tag_name?: unknown; body?: unknown; html_url?: unknown };
      const tag = typeof found.tag_name === "string" ? found.tag_name : "";
      if (!isStable(tag)) return;
      const page = typeof found.html_url === "string" && found.html_url.startsWith("https://") ? found.html_url : "";
      latest = { version: tag.replace(/^v/, ""), notes: typeof found.body === "string" ? found.body.slice(0, 20_000) : "", url: page };
    } catch {}
  }
  const timer = url ? setInterval(check, day) : undefined;
  timer?.unref();
  if (url) void check();
  return {
    // The running version, and the newest release when it is newer.
    get: () => ({ version, latest: latest && compareVersions(latest.version, version) > 0 ? latest : null }),
    close: () => clearInterval(timer),
  };
}
