import { createFxbot, releasesUrlFor, type AddonRef, type ItemKind, type UpdateStatus } from "@fxbot/sdk";
import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { installed, repository, update, version } from "./update.ts";

// Loopback by default. Other devices reach it through `tailscale serve`; the page never holds a secret. In its container
// it listens on FXBOT_HOST, 0.0.0.0, and compose publishes the port on the machine's loopback only. FXBOT_PORT lets a
// check run beside a running server.
const port = Number(process.env.FXBOT_PORT ?? 8787);
const host = process.env.FXBOT_HOST || "127.0.0.1";
const { FXBOT_DATABASE_URL: databaseUrl, FXBOT_SECRET_KEY_FILE: keyFile } = process.env;
if (!databaseUrl) throw new Error("FXBOT_DATABASE_URL is required: fxbot keeps its records in Postgres (see the README)");
if (!keyFile) throw new Error("FXBOT_SECRET_KEY_FILE is required: a file outside the repo with 32 random bytes in base64 (see the README)");

const fxbot = await createFxbot({
  databaseUrl,
  secretKey: readFileSync(keyFile, "utf8"),
  vercelClientId: process.env.FXBOT_VERCEL_CLIENT_ID || undefined,
  dataDir: process.env.FXBOT_DATA,
  backupsDir: process.env.FXBOT_BACKUPS,
  version,
  // GitHub's newest release for the repository in package.json, unless turned off.
  releasesUrl: process.env.FXBOT_UPDATE_CHECK === "off" ? undefined : process.env.FXBOT_RELEASES_URL || releasesUrlFor(repository),
  // MCP sign-ins redirect to the browser's loopback, which reaches the published port.
  localUrl: `http://127.0.0.1:${port}`,
  clientMetadataUrl: process.env.FXBOT_CLIENT_METADATA_URL || undefined,
  registryUrl: process.env.FXBOT_MCP_REGISTRY || undefined,
  everythingUrl: process.env.FXBOT_MCP_EVERYTHING || undefined,
  listsUrl: process.env.FXBOT_LISTS_URL || undefined,
});

// The ui package's build, served beside the API.
const dist = join(import.meta.dirname, "..", "..", "ui", "dist");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));

// A library file goes out as data: an image under its checked type, every document as plain text, with no sniffing and
// a sandbox that runs nothing, even opened in its own tab. `no-cache` asks again each time, so a deleted item stops
// showing; the SHA-256 is the ETag, so an unchanged one costs a 304.
async function file(req: IncomingMessage, res: ServerResponse, url: URL, read: (ifNoneMatch?: string) => Promise<{ name: string; kind: string; type: string; sha256: string; data: Buffer | null }>) {
  const { name, kind, type, sha256, data } = await read(req.headers["if-none-match"]);
  const headers: Record<string, string> = {
    "content-type": kind === "image" ? type : "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "cache-control": "private, no-cache",
    etag: `"${sha256}"`,
  };
  if (url.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
  if (!data) return res.writeHead(304, headers).end();
  res.writeHead(200, headers).end(data);
}

// A JSON object, unchecked past that: the SDK checks each field it reads.
async function body<T>(req: IncomingMessage, limit = 1 << 20): Promise<T> {
  const over = `body is over ${limit >> 20} MiB`;
  if (Number(req.headers["content-length"]) > limit) fail(413, over);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, over);
    chunks.push(chunk);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {}
  if (value && typeof value === "object" && !Array.isArray(value)) return value as T;
  return fail(400, "body must be a JSON object");
}

// Where a browser lands after signing in to an MCP server. The message can carry the server's own words, so it is
// escaped, and the page runs nothing.
async function signedIn(res: ServerResponse, query: URLSearchParams) {
  let message: string;
  try {
    const { status, error } = await fxbot.oauth.callback(query);
    message = status === "done" ? "Connected. You can close this tab." : `Sign-in failed: ${error}`;
  } catch (error) {
    message = `Sign-in failed: ${(error as Error).message}`;
  }
  const text = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  res
    .writeHead(message.startsWith("Connected") ? 200 : 400, { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "cache-control": "no-store" })
    .end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>fxbot</title><p style="font:16px system-ui;margin:2rem">${text}</p>`);
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const [, , resource, id, action, extra] = url.pathname.split("/");
  const method = req.method;
  const ok = { ok: true };
  if (resource === "health" && !id && method === "GET") return json(res, 200, { ok: true, version });
  if (resource === "update" && !id) {
    if (method === "GET") return json(res, 200, updateStatus());
    // To the newest release the check found, never one the page names.
    if (method === "POST") return json(res, 202, startUpdate());
    return fail(404, "not found");
  }
  if (resource === "addons" && extra === undefined) {
    if (id === "preview" && !action && method === "POST") return json(res, 200, await fxbot.addons.preview((await body<{ ref: AddonRef }>(req)).ref));
    if (id === "search" && !action && method === "GET")
      return json(res, 200, await fxbot.addons.search(url.searchParams.get("q") ?? "", { kind: url.searchParams.get("kind") ?? undefined, everything: url.searchParams.get("everything") === "1" }));
    if (id && action === "update" && method === "POST") return json(res, 200, await fxbot.addons.update(id, (await body<{ hash?: unknown }>(req)).hash));
    if (!id && method === "GET") return json(res, 200, await fxbot.addons.list());
    if (!id && method === "POST") {
      const { ref, hash } = await body<{ ref: AddonRef; hash: string }>(req);
      return json(res, 201, await fxbot.addons.add(ref, hash));
    }
    if (id && !action && method === "PATCH") return json(res, 200, await fxbot.addons.change(id, await body(req)));
    if (id && !action && method === "DELETE") return json(res, 200, (await fxbot.addons.remove(id), ok));
    if (id && action === "secrets" && method === "PUT") return json(res, 200, await fxbot.addons.setSecrets(id, await body(req)));
    if (id && action === "skills" && method === "GET") return json(res, 200, { text: fxbot.addons.readSkill(id, url.searchParams.get("file") ?? undefined) });
    // The checked origin is where the sign-in comes back to.
    if (id && action === "sign-in" && method === "POST") return json(res, 201, await fxbot.oauth.start(id, req.headers.origin));
    return fail(404, "not found");
  }
  if (resource === "oauth") {
    if (id === "callback" && !action && method === "GET") return signedIn(res, url.searchParams);
    if (id === "attempts" && action && !extra && method === "GET") return json(res, 200, fxbot.oauth.get(action));
    if (id === "attempts" && action && extra === "paste" && method === "POST") return json(res, 200, await fxbot.oauth.paste(action, (await body<{ address: string }>(req)).address));
    return fail(404, "not found");
  }
  if (resource === "profiles" && action === "addons" && extra && method === "PUT")
    return json(res, 200, await fxbot.addons.forBot(id, extra, (await body<{ enabled: boolean }>(req)).enabled));
  if (resource === "settings" && !id) {
    if (method === "GET") return json(res, 200, await fxbot.settings.get());
    if (method === "PATCH") return json(res, 200, await fxbot.settings.update(await body(req)));
    return fail(405, "method not allowed");
  }
  if (resource === "providers" && extra === undefined) {
    if (!id && method === "GET") return json(res, 200, await fxbot.providers.list());
    if (!id && method === "POST") return json(res, 201, await fxbot.providers.add(await body(req)));
    if (id && !action && method === "PATCH") return json(res, 200, await fxbot.providers.update(id, await body(req)));
    if (id && !action && method === "DELETE") return json(res, 200, (await fxbot.providers.remove(id), ok));
    if (id && action === "models" && method === "GET") return json(res, 200, await fxbot.providers.models(id));
    if (id && action === "teams" && method === "GET") return json(res, 200, await fxbot.providers.teams(id));
    return fail(404, "not found");
  }
  if (resource === "sign-ins" && !action) {
    if (!id && method === "POST") return json(res, 201, await fxbot.signIns.start(await body(req)));
    if (id && method === "GET") return json(res, 200, fxbot.signIns.get(id));
    if (id && method === "DELETE") return json(res, 200, (fxbot.signIns.cancel(id), ok));
    return fail(404, "not found");
  }
  if (resource === "library" && extra === undefined) {
    const query = url.searchParams;
    const optional = (key: string) => query.get(key) ?? undefined;
    if (!id && method === "GET")
      return json(res, 200, await fxbot.library.list({ q: optional("q"), profileId: optional("profile"), kind: optional("kind") as ItemKind | undefined, before: optional("before"), limit: query.has("limit") ? Number(query.get("limit")) : undefined }));
    if (id && !action && method === "GET") return json(res, 200, await fxbot.library.get(id));
    if (id && !action && method === "DELETE") return json(res, 200, (await fxbot.library.remove(id), ok));
    if (id && action === "file" && method === "GET") return file(req, res, url, (etag) => fxbot.library.file(id, etag));
    return action && action !== "file" ? fail(404, "not found") : fail(405, "method not allowed");
  }
  // An image's URL from before the library, kept in older chats.
  if (resource === "profiles" && action === "uploads" && method === "GET") return file(req, res, url, (etag) => fxbot.library.upload(id, extra ?? "", etag));
  if (resource !== "profiles" || extra !== undefined) return fail(404, "not found");

  if (!id) {
    if (method === "GET") return json(res, 200, await fxbot.profiles.list());
    if (method === "POST") return json(res, 201, await fxbot.profiles.create(await body(req)));
    return fail(405, "method not allowed");
  }
  const profile = await fxbot.profiles.get(id);

  if (!action) {
    if (method === "GET") return json(res, 200, profile);
    if (method === "PATCH") return json(res, 200, await fxbot.profiles.update(id, await body(req)));
    if (method === "DELETE") return json(res, 200, (await fxbot.profiles.remove(id), ok));
  } else if (action === "messages" && method === "POST") {
    // libfx takes at most 6 MiB of images in a message, so with base64 a message stays under 12 MiB.
    return json(res, 200, await fxbot.send(id, await body(req, 12 << 20)));
  } else if (action === "earlier" && method === "GET") {
    return json(res, 200, await fxbot.profiles.earlier(id));
  } else if (action === "skills" && method === "GET") {
    return json(res, 200, await fxbot.profiles.skills(id));
  } else if (action === "stream" && method === "GET") {
    const lines = await fxbot.stream(id, Number(url.searchParams.get("cursor") ?? 0));
    res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" }).flushHeaders();
    // Replays from the cursor, then stays open. A closed response cancels the stream.
    return pipeline(Readable.fromWeb(lines as ReadableStream<Uint8Array>), res).catch(() => {});
  }
  return fail(action ? 404 : 405, action ? "not found" : "method not allowed");
}

// The built page. Paths that are not files get index.html, so the app's routes load.
function page(res: ServerResponse, pathname: string) {
  let file = normalize(join(dist, pathname));
  if (!file.startsWith(dist) || !statSync(file, { throwIfNoEntry: false })?.isFile()) file = join(dist, "index.html");
  try {
    const data = readFileSync(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch {
    json(res, 404, { error: "no build in packages/ui/dist/; run npm run build" });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("x-fxbot-version", version);
    // A browser names the page's origin on every write. A write from another site's page is refused, so a site open in
    // the same browser cannot change fxbot. Tools without a browser send no origin.
    const origin = req.headers.origin;
    if (req.method !== "GET" && req.method !== "HEAD" && origin !== undefined && (!URL.canParse(origin) || new URL(origin).host !== req.headers.host))
      return json(res, 403, { error: "This request came from another site." });
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) await api(req, res, url);
    // A loopback redirect from an MCP sign-in, when the browser runs on this machine.
    else if (url.pathname === "/callback" && req.method === "GET") await signedIn(res, url.searchParams);
    else page(res, url.pathname);
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) json(res, status, { error: error instanceof Error ? error.message : String(error) });
    else res.destroy();
  }
});

server.listen(port, host, () => console.log(`fxbot server on http://${host}:${port}`));

// Stop taking requests, then let libfx finish the turns this process started. 75 asks systemd for a restart.
async function shutdown(code = 0) {
  server.close();
  server.closeAllConnections();
  await fxbot.close();
  process.exit(code);
}

// Settings updates only an install made by setup.sh, under systemd (which sets INVOCATION_ID), since systemd starts the
// new release once this one exits. Elsewhere Settings shows the commands.
const canUpdate = Boolean(process.env.INVOCATION_ID && installed());
let updating: UpdateStatus["updating"] = null;
const updateStatus = (): UpdateStatus => ({ ...fxbot.release(), canUpdate, updating });
function startUpdate() {
  const { latest } = fxbot.release();
  if (!canUpdate) fail(400, "Settings can update an install made by setup.sh. Here, use npm run update or git.");
  if (!latest) fail(400, `fxbot ${version} is the newest release.`);
  if (updating && !updating.error) fail(409, "An update is running.");
  const now: NonNullable<UpdateStatus["updating"]> = { to: latest!.version, steps: [] };
  updating = now;
  update({ to: latest!.version, log: (step) => now.steps.push(step) }).then(
    () => {
      now.restarting = true;
      // Long enough for the page's next poll to see it.
      setTimeout(() => void shutdown(75), 1500);
    },
    (error: Error) => (now.error = error.message),
  );
  return updateStatus();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
