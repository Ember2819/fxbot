import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

type Fetch = typeof fetch;
// A file kept from a repository, or one passed over and why.
export type RepoFiles = { text: Map<string, string>; skipped: Map<string, string> };

export const limits = { file: 256 * 1024, download: 50 * 1024 * 1024 };
const repoName = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const cacheMs = 5 * 60 * 1000;
const utf8 = new TextDecoder("utf-8", { fatal: true });

// A repository on GitHub, read without GitHub's API and its hourly limit: `info/refs` names the commit HEAD points at,
// as `git ls-remote` asks it, and codeload serves that commit's files as a tar.gz, read in memory. Nothing is written
// to disk. Only regular files are kept, inside the repository, as text up to 256 KiB each, or the caller's limit.
export function createArchives({ fetch, github = "https://github.com", codeload = "https://codeload.github.com" }: { fetch: Fetch; github?: string; codeload?: string }) {
  const read = new Map<string, { at: number; files: Promise<RepoFiles> }>();

  async function head(repo: string) {
    if (!repoName.test(repo)) throw new Error(`${repo} isn't a GitHub repository.`);
    const res = await fetch(`${github}/${repo}.git/info/refs?service=git-upload-pack`, { signal: AbortSignal.timeout(30_000) });
    // A private repository asks for a sign-in.
    if (res.status === 404 || res.status === 401) throw new Error(`GitHub has no public repository ${repo}.`);
    if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status} for ${repo}.`);
    const found = /([0-9a-f]{40}) HEAD[\0\n ]/.exec(await res.text());
    if (!found) throw new Error(`${repo} has no commits.`);
    return found[1];
  }

  async function download(repo: string, commit: string, fileLimit: number): Promise<RepoFiles> {
    const res = await fetch(`${codeload}/${repo}/tar.gz/${commit}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok || !res.body) throw new Error(`GitHub answered HTTP ${res.status} for ${repo}'s files.`);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of Readable.fromWeb(res.body as never).pipe(createGunzip())) {
      size += (chunk as Buffer).length;
      if (size > limits.download) throw new Error(`${repo} is over ${limits.download / 1024 / 1024} MB.`);
      chunks.push(chunk as Buffer);
    }
    return untar(Buffer.concat(chunks), fileLimit);
  }

  return {
    head,
    // A commit's files, kept for 5 minutes, so a page and its Add read the repository once.
    files(repo: string, commit: string, fileLimit = limits.file) {
      if (!repoName.test(repo) || !/^[0-9a-f]{40}$/.test(commit)) return Promise.reject(new Error(`${repo} ${commit} isn't a GitHub commit.`));
      const key = `${repo}@${commit}:${fileLimit}`;
      const hit = read.get(key);
      if (hit && Date.now() - hit.at < cacheMs) return hit.files;
      const files = download(repo, commit, fileLimit);
      read.set(key, { at: Date.now(), files });
      files.catch(() => read.delete(key));
      return files;
    },
  };
}

// A tar's regular files, by their path below the archive's top folder (GitHub's `<repo>-<commit>/`). pax and GNU long
// names are read; links, devices, and any path that would leave the repository are skipped.
export function untar(tar: Buffer, fileLimit = limits.file): RepoFiles {
  const out: RepoFiles = { text: new Map(), skipped: new Map() };
  let at = 0;
  let pax: Record<string, string> = {};
  let longName: string | undefined;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, length: number) => header.subarray(start, start + length).toString("utf8").replace(/\0[\s\S]*$/, "");
    const size = pax.size ? Number(pax.size) : header[124] & 0x80 ? Infinity : parseInt(field(124, 12).trim() || "0", 8);
    if (!Number.isFinite(size) || size < 0 || at + 512 + size > tar.length) break;
    const type = String.fromCharCode(header[156] || 48);
    const body = tar.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") {
      pax = paxRecords(body);
      continue;
    }
    if (type === "g") continue;
    if (type === "L") {
      longName = body.toString("utf8").replace(/\0[\s\S]*$/, "");
      continue;
    }
    const prefix = field(345, 155);
    const name = pax.path ?? longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    pax = {};
    longName = undefined;
    const path = name.split("/").slice(1).join("/");
    if (!path || path.endsWith("/")) continue;
    if (path.split("/").some((part) => part === ".." || part === "") || path.startsWith("/")) continue;
    if (type === "1" || type === "2") out.skipped.set(path, "a link");
    else if (type !== "0") continue;
    else if (size > fileLimit) out.skipped.set(path, `over ${fileLimit / 1024} KiB`);
    else {
      const text = textOf(body);
      if (text === undefined) out.skipped.set(path, "not text");
      else out.text.set(path, text);
    }
  }
  return out;
}

// pax records: "<length> <key>=<value>\n", one after another.
function paxRecords(body: Buffer) {
  const records: Record<string, string> = {};
  let at = 0;
  while (at < body.length) {
    const space = body.indexOf(0x20, at);
    const length = Number(body.subarray(at, space).toString());
    if (space < 0 || !length) break;
    const record = body.subarray(space + 1, at + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    records[record.slice(0, equals)] = record.slice(equals + 1);
    at += length;
  }
  return records;
}

// Text is valid UTF-8 without NUL bytes.
function textOf(body: Buffer) {
  if (body.includes(0)) return undefined;
  try {
    return utf8.decode(body);
  } catch {
    return undefined;
  }
}
