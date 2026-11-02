import { compareVersions, isStable, isVersion } from "@fxbot/sdk";
import { execFile } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Updating fxbot from one release to a newer one, from Settings or with `npm run update`. A release is built in its own
// folder beside the running one, then `current` is pointed at it, and the next start runs it:
//   <install>/repo            a clone, for fetching tags
//   <install>/releases/<tag>  a git worktree at each tag, with its node_modules and build
//   <install>/current         a link to the running release
// setup.sh makes this layout. A checkout anywhere else updates with git.

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "..", "..", "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; repository?: string | { url: string } };
export const version = manifest.version;
export const repository = typeof manifest.repository === "string" ? manifest.repository : (manifest.repository?.url ?? "");

// npm beside this Node, and that Node first on the PATH for npm's own scripts.
const bin = dirname(process.execPath);
const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
const git = async (cwd: string, ...args: string[]) => (await run("git", ["-C", cwd, ...args])).stdout.trim();
const npm = (cwd: string, ...args: string[]) => run(join(bin, "npm"), args, { cwd, env, maxBuffer: 64 * 2 ** 20 });
const refuse = (message: string): never => {
  throw Object.assign(new Error(message), { status: 400 });
};

// The layout above, when this checkout is one of its releases.
export function installed() {
  const releases = dirname(root);
  const install = dirname(releases);
  const current = lstatSync(join(install, "current"), { throwIfNoEntry: false });
  if (basename(releases) !== "releases" || !current?.isSymbolicLink() || !existsSync(join(install, "repo", ".git"))) return null;
  return { install, repo: join(install, "repo"), releases };
}

async function place() {
  const found = installed();
  if (found) return found;
  const branch = await git(root, "symbolic-ref", "--short", "-q", "HEAD").catch(() => "");
  return refuse(branch ? `This checkout follows ${branch}. Update it with git pull.` : "This checkout isn't an install made by setup.sh. Update it with git.");
}

// One update at a time, across the server and the command. A lock left by a process that died is taken over.
async function locked<T>(install: string, work: () => Promise<T>) {
  const lock = join(install, "update.lock");
  try {
    await writeFile(lock, String(process.pid), { flag: "wx" });
  } catch {
    const pid = Number(readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid && alive(pid)) refuse("Another update is running.");
    await writeFile(lock, String(process.pid));
  }
  try {
    return await work();
  } finally {
    await unlink(lock).catch(() => {});
  }
}
function alive(pid: number) {
  try {
    return process.kill(pid, 0);
  } catch {
    return false;
  }
}

// To the newest stable release, or to `to`, which may be a prerelease. Reports each step to `log`, and returns the new
// version once `current` points at it. Nothing changes until the new release has built.
export async function update({ to, log }: { to?: string; log: (step: string) => void }) {
  const { install, repo, releases } = await place();
  return locked(install, async () => {
    log("Looking for releases");
    await git(repo, "fetch", "--quiet", "--tags", "--force", "origin");
    const tags = (await git(repo, "tag", "--list", "v*")).split("\n").filter(isVersion);
    const tag = to ? `v${to.replace(/^v/, "")}` : tags.filter(isStable).sort(compareVersions).at(-1);
    if (!tag || !tags.includes(tag)) return refuse(to ? `There is no release ${to}.` : "There are no releases yet.");
    const next = tag.slice(1);
    const order = compareVersions(next, version);
    if (order === 0) return refuse(to ? `fxbot ${version} is already running.` : `fxbot ${version} is the newest release.`);
    if (order < 0)
      return refuse(to ? `${next} is older than ${version}. Going back is a restore: see the README.` : `fxbot ${version} is newer than the newest release, ${next}.`);

    const folder = join(releases, tag);
    await drop(repo, folder);
    log(`Getting ${next}`);
    await git(repo, "worktree", "add", "--quiet", "--detach", folder, tag);
    try {
      log("Installing its packages");
      await npm(folder, "ci", "--no-audit", "--no-fund");
      log("Building the page");
      await npm(folder, "run", "build");
    } catch (error) {
      await drop(repo, folder);
      const output = String((error as { stderr?: string }).stderr || (error as Error).message).trim().split("\n").slice(-4).join("\n");
      throw new Error(`${next} did not build, so fxbot stays on ${version}:\n${output}`);
    }

    log(`Switching to ${next}`);
    const link = join(install, "current");
    await rm(`${link}.new`, { force: true });
    await symlink(join("releases", tag), `${link}.new`);
    await rename(`${link}.new`, link);
    // The new release and the running one stay, for going back.
    for (const old of await readdir(releases)) if (old !== tag && old !== basename(root)) await drop(repo, join(releases, old));
    return next;
  });
}

async function drop(repo: string, folder: string) {
  await git(repo, "worktree", "remove", "--force", folder).catch(() => rm(folder, { recursive: true, force: true }));
  await git(repo, "worktree", "prune");
}

// npm run update [-- <version>]
if (realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [to] = process.argv.slice(2);
  try {
    const next = await update({ to, log: (step) => console.log(`${step}…`) });
    console.log(`fxbot ${next} is ready. Restart fxbot to run it: sudo systemctl restart fxbot`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
