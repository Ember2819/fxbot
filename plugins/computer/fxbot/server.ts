import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { request, type IncomingHttpHeaders } from "node:http";
import { userInfo } from "node:os";
import { join, posix, resolve } from "node:path";
import type { PluginApi } from "@fxbot/sdk";

// A Linux computer for each bot, in the machine's own container engine, podman or docker, which host/setup.sh runs
// rootless for a user of its own. The plugin speaks the Docker API, which both engines answer, over the engine's
// socket: commands run through exec, files move as tar, and the image is made by running steps in a container and
// committing it. A computer is `sleep` under an init, with no daemon in it.

const base = "docker.io/library/debian:trixie-slim";
const packages = "ca-certificates curl git python3 procps ripgrep jq unzip xz-utils";
const env = ["HOME=/root", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "DEBIAN_FRONTEND=noninteractive"];
const mib = 1024 * 1024;
// libfx takes images up to 3.75 MiB, and a tool's result up to 64 KiB, so text is read 60 KB at a time; the library
// keeps text up to 1 MiB; a file over 32 MiB is read with the shell.
const maxImage = 3.75 * mib;
const page = 60_000;
const maxText = mib;
const maxRead = 32 * mib;
// The socket in a release install's app container, then where setup.sh makes it, for a checkout.
const sockets = ["/run/fxbot-computer/engine.sock", "/var/lib/fxbot-computer/run/engine.sock"];
const script = resolve(import.meta.dirname, "../host/setup.sh");
const run = readFileSync(join(import.meta.dirname, "fxbot-run"));
const isBot = /^[0-9a-f]{12}$/;

type Engine = { state: "ready" | "unreachable" | "rootful"; socket: string; name?: string; version?: string; error?: string };
type Step = { from: string; run: string };
type Answer = { status: number; headers: IncomingHttpHeaders; data: Buffer };

const magic: [string, (b: Buffer) => boolean][] = [
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", (b) => b.subarray(0, 4).toString("latin1") === "GIF8"],
  ["image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
];
const imageType = (bytes: Buffer) => magic.find(([, is]) => is(bytes))?.[0];
const textTypes: Record<string, string> = { md: "text/markdown", csv: "text/csv", json: "application/json", html: "text/html" };
// A text cut to at most `bytes` of UTF-8, at a whole character.
const cutTo = (text: string, bytes: number) => new TextDecoder().decode(Buffer.from(text).subarray(0, bytes)).replace(/\uFFFD$/, "");
const sizeOf = (n: number) => (n >= mib ? `${(n / mib).toFixed(1)} MiB` : `${Math.ceil(n / 1024)} KiB`);
// A path on the computer: a relative one starts at /root.
const where = (path: unknown) => posix.resolve("/root", String(path ?? "").trim() || ".");

// A tar of files at their paths from /, as `PUT /archive` takes at /, which makes their folders. A PAX header carries
// a path over 100 bytes.
function tar(files: { path: string; bytes: Buffer; mode?: number }[]) {
  const header = (name: string, size: number, mode: number, type: string) => {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100);
    h.write(`${mode.toString(8).padStart(7, "0")}\0`, 100);
    h.write("0000000\0", 108);
    h.write("0000000\0", 116);
    h.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
    h.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, "0")}\0`, 136);
    h.write(type, 156);
    h.write("ustar\x0000", 257);
    h.fill(" ", 148, 156);
    h.write(`${h.reduce((sum, b) => sum + b, 0).toString(8).padStart(6, "0")}\0 `, 148);
    return h;
  };
  const padded = (data: Buffer) => [data, Buffer.alloc((512 - (data.length % 512)) % 512)];
  const blocks: Buffer[] = [];
  for (const { path, bytes, mode = 0o644 } of files) {
    const name = path.replace(/^\/+/, "");
    if (Buffer.byteLength(name) > 100) {
      // A record is its own length, then " path=<path>\n".
      const rest = ` path=${name}\n`;
      let length = Buffer.byteLength(rest);
      while (Buffer.byteLength(`${length}${rest}`) !== length) length = Buffer.byteLength(`${length}${rest}`);
      blocks.push(header("PaxHeader", length, 0o644, "x"), ...padded(Buffer.from(`${length}${rest}`)));
    }
    blocks.push(header(name, bytes.length, mode, "0"), ...padded(bytes));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
// The first regular file in a tar.
function untar(data: Buffer) {
  for (let at = 0; at + 512 <= data.length && data[at] !== 0; ) {
    const size = parseInt(data.subarray(at + 124, at + 136).toString("latin1").replace(/[\0 ]+$/, "") || "0", 8);
    if (data[at + 156] === 0x30 || data[at + 156] === 0) return data.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

export default function setup(fx: PluginApi) {
  let engine: Engine = { state: "unreachable", socket: "" };
  const socket = () => fx.settings.engine || sockets.find((path) => existsSync(path)) || sockets[0];
  const notReady = () =>
    engine.state === "rootful"
      ? "The computer's engine runs as root, so the computer won't use it. The owner runs the setup command in Settings."
      : `The computer isn't set up on this machine: its engine doesn't answer at ${engine.socket}. The owner runs the setup command in Settings.`;

  // One call to the engine. A streamed answer goes to `stream` as it comes.
  function call(method: string, path: string, options: { body?: unknown; type?: string; timeout?: number } = {}, stream?: (chunk: Buffer) => void) {
    const { body, type = "application/json", timeout = 60_000 } = options;
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    return new Promise<Answer>((done, fail) => {
      const req = request({ socketPath: engine.socket || socket(), path, method, headers: payload ? { "content-type": type, "content-length": payload.length } : {} }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => (stream ? stream(chunk) : chunks.push(chunk)));
        res.on("end", () => done({ status: res.statusCode ?? 0, headers: res.headers, data: Buffer.concat(chunks) }));
        res.on("error", fail);
      });
      req.setTimeout(timeout, () => req.destroy(new Error(`The engine didn't answer ${method} ${path.split("?")[0]} in ${timeout / 1000} s.`)));
      req.on("error", fail);
      req.end(payload);
    });
  }
  // A call that must succeed: its JSON answer, or the engine's message as the error.
  async function json<T = any>(method: string, path: string, body?: unknown, timeout?: number): Promise<T> {
    const { status, data } = await call(method, path, { body, timeout });
    const text = data.toString("utf8");
    let answer: any = text;
    try {
      answer = text ? JSON.parse(text) : null;
    } catch {}
    if (status >= 400) throw Object.assign(new Error(answer?.message ?? (text || `HTTP ${status}`)), { status });
    return answer;
  }
  const query = (filters: Record<string, string[]>) => encodeURIComponent(JSON.stringify(filters));

  // A command in a container: its exit code and its output, stdout and stderr as they came. Each frame of the stream
  // is its stream's number, three zeros, its length, and its bytes.
  async function exec(container: string, cmd: string[], { timeout = 60_000, line }: { timeout?: number; line?: (text: string) => void } = {}) {
    const { Id } = await json("POST", `/containers/${container}/exec`, { AttachStdout: true, AttachStderr: true, Cmd: cmd, Env: env, WorkingDir: "/root" });
    const parts: Buffer[] = [];
    let pending = Buffer.alloc(0);
    let rest = "";
    await call("POST", `/exec/${Id}/start`, { body: { Detach: false, Tty: false }, timeout }, (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 8 && pending.length >= 8 + pending.readUInt32BE(4)) {
        const frame = pending.subarray(8, 8 + pending.readUInt32BE(4));
        pending = pending.subarray(8 + frame.length);
        parts.push(frame);
        if (!line) continue;
        const lines = (rest + frame.toString("utf8")).split("\n");
        rest = lines.pop()!;
        lines.forEach(line);
      }
    });
    if (line && rest) line(rest);
    // The engine may answer the stream's end a moment before it has the code.
    for (let tries = 0; ; tries++) {
      const { ExitCode } = await json("GET", `/exec/${Id}/json`);
      if (typeof ExitCode === "number" || tries === 40) return { code: (ExitCode ?? -1) as number, output: Buffer.concat(parts).toString("utf8") };
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  async function put(container: string, files: { path: string; bytes: Buffer; mode?: number }[]) {
    const { status, data } = await call("PUT", `/containers/${container}/archive?path=/`, { body: tar(files), type: "application/x-tar", timeout: 120_000 });
    if (status >= 400) throw new Error(`The engine couldn't write the file: ${data.toString("utf8").trim() || `HTTP ${status}`}`);
  }

  // A file's bytes from a computer, following links.
  async function fetchFile(container: string, path: string, depth = 0): Promise<Buffer> {
    const head = await call("HEAD", `/containers/${container}/archive?path=${encodeURIComponent(path)}`);
    if (head.status === 404) throw new Error(`${path} doesn't exist.`);
    if (head.status >= 400) throw new Error(`The engine couldn't read ${path}: HTTP ${head.status}.`);
    const stat = JSON.parse(Buffer.from(String(head.headers["x-docker-container-path-stat"] ?? ""), "base64").toString("utf8") || "{}");
    if (Math.floor(stat.mode / 2 ** 31) % 2) throw new Error(`${path} is a folder.`);
    if (stat.linkTarget && depth < 8) return fetchFile(container, posix.resolve(posix.dirname(path), stat.linkTarget), depth + 1);
    if (stat.size > maxRead) throw new Error(`${path} is ${sizeOf(stat.size)}, too big to read whole. Read parts of it with computer_shell, such as sed -n.`);
    const { status, data } = await call("GET", `/containers/${container}/archive?path=${encodeURIComponent(path)}`, { timeout: 120_000 });
    const bytes = status < 400 ? untar(data) : null;
    if (!bytes) throw new Error(`The engine couldn't read ${path}.`);
    return bytes;
  }

  // The image: the base's packages, then the setup steps of each plugin that needs the computer, by name. Its tag is
  // the hash of the base, fxbot-run, and the steps.
  function steps(): Step[] {
    const theirs = fx
      .dependents()
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .flatMap(({ name, version, needs }) => (Array.isArray(needs.setup) ? needs.setup.filter((s): s is string => typeof s === "string").map((run) => ({ from: `${name} ${version}`, run })) : []));
    return [{ from: "computer", run: `apt-get update && apt-get install -y --no-install-recommends ${packages} && rm -rf /var/lib/apt/lists/*` }, ...theirs];
  }
  const tagOf = (all: Step[]) => `localhost/fxbot-computer:${createHash("sha256").update(JSON.stringify([base, run.toString("utf8"), ...all.map((s) => s.run)])).digest("hex").slice(0, 12)}`;
  const idOf = (id: string) => String(id ?? "").replace(/^sha256:/, "");
  let build: { lines: string[]; done: Promise<string> } | null = null;
  let buildError = "";

  // The image for the current steps, made now if it isn't there. One build runs at a time.
  async function image(again = false): Promise<string> {
    const all = steps();
    const tag = tagOf(all);
    if (build) return build.done.catch(() => "").then(() => image(again));
    if (!again && (await call("GET", `/images/${tag}/json`)).status === 200) return tag;
    const lines: string[] = [];
    build = { lines, done: make(tag, all, lines) };
    try {
      await build.done;
      buildError = "";
      return tag;
    } catch (error) {
      buildError = (error as Error).message;
      fx.log(`The image didn't build: ${buildError}`);
      throw error;
    } finally {
      build = null;
    }
  }
  async function make(tag: string, all: Step[], lines: string[]) {
    const say = (line: string) => (lines.push(line), lines.length > 300 && lines.shift());
    say(`Pulling ${base}`);
    const [from, at] = base.split(":");
    let pulled = "";
    const pull = await call("POST", `/images/create?fromImage=${from}&tag=${at}`, { timeout: 600_000 }, (chunk) => void (pulled += chunk.toString("utf8")));
    const failed = pulled.split("\n").map((l) => (l ? JSON.parse(l) : {})).find((l) => l.error);
    if (pull.status >= 400 || failed) throw new Error(`Pulling ${base} failed: ${failed?.error ?? `HTTP ${pull.status}`}`);
    const builder = `fxbot-computer-build-${tag.split(":")[1]}`;
    await call("DELETE", `/containers/${builder}?force=true`);
    await json("POST", `/containers/create?name=${builder}`, { Image: base, Cmd: ["sleep", "infinity"], Env: env, Labels: { "fxbot.image": tag }, HostConfig: { Init: true } });
    try {
      await json("POST", `/containers/${builder}/start`);
      await put(builder, [{ path: "/usr/local/bin/fxbot-run", bytes: run, mode: 0o755 }]);
      for (const [i, step] of all.entries()) {
        say(`Step ${i + 1} of ${all.length}, from ${step.from}: ${step.run}`);
        fx.log(lines.at(-1)!);
        const { code } = await exec(builder, ["bash", "-c", step.run], { timeout: 1_800_000, line: say });
        if (code !== 0) throw new Error(`Step ${i + 1}, from ${step.from}, failed with exit ${code}: ${lines.slice(-3).join(" / ")}`);
      }
      const [repo, hash] = tag.split(":");
      await json("POST", `/commit?container=${builder}&repo=${repo}&tag=${hash}`, undefined, 600_000);
      say(`Made ${tag}`);
      fx.log(`Made ${tag}`);
    } finally {
      await call("DELETE", `/containers/${builder}?force=true`).catch(() => {});
    }
    await prune(tag);
    return tag;
  }
  // Images of earlier steps go once no computer uses them: the engine refuses one that a computer does.
  async function prune(keep: string) {
    const current = idOf((await json("GET", `/images/${keep}/json`)).Id);
    for (const { Id } of await json<{ Id: string }[]>("GET", `/images/json?filters=${query({ label: ["fxbot.image"] })}`))
      if (idOf(Id) !== current) await call("DELETE", `/images/${idOf(Id)}`).catch(() => {});
  }

  // Computers, one for each bot, with its home in a volume of the same name.
  const nameOf = (bot: string) => `fxbot-computer-${bot}`;
  const last = new Map<string, number>();
  const busy = new Map<string, number>();
  const starting = new Map<string, Promise<string>>();
  let timer: NodeJS.Timeout | undefined;
  const limits = () => ({ Memory: Math.round(mib * (Number(fx.settings.memoryMiB) || 2048)), NanoCpus: Math.round(1e9 * (Number(fx.settings.cpus) || 2)) });

  async function computers() {
    const list = await json<{ Labels: Record<string, string>; State: string }[]>("GET", `/containers/json?all=true&filters=${query({ label: ["fxbot.computer"] })}`);
    return list.map((c) => ({ bot: c.Labels["fxbot.computer"], running: c.State === "running" }));
  }
  const inspect = async (name: string) => {
    const { status, data } = await call("GET", `/containers/${name}/json`);
    return status === 404 ? null : JSON.parse(data.toString("utf8"));
  };
  // Marks a call, and keeps the idle timer running while any computer does.
  function used(bot: string) {
    last.set(bot, Date.now());
    const idle = (Number(fx.settings.idleMinutes) || 15) * 60_000;
    timer ??= setInterval(() => void sweep().catch((error) => fx.log(`Stopping idle computers failed: ${error.message}`)), Math.min(30_000, idle / 2));
  }
  async function sweep() {
    const idle = (Number(fx.settings.idleMinutes) || 15) * 60_000;
    let stopped = false;
    for (const [bot, at] of last) {
      if (Date.now() - at < idle || busy.get(bot) || starting.has(bot)) continue;
      last.delete(bot);
      await call("POST", `/containers/${nameOf(bot)}/stop?t=5`, { timeout: 30_000 });
      stopped = true;
    }
    if (stopped) await forget();
    if (!last.size) timer = (clearInterval(timer), undefined);
  }
  // The computers and homes of bots that are gone.
  async function forget() {
    const bots = new Set((await fx.bots.list()).map((bot) => bot.id));
    for (const { bot } of await computers()) if (!bots.has(bot)) await remove(bot);
  }
  async function remove(bot: string) {
    await call("DELETE", `/containers/${nameOf(bot)}?force=true`, { timeout: 60_000 });
    await call("DELETE", `/volumes/${nameOf(bot)}?force=true`);
    last.delete(bot);
    noted.delete(bot);
  }

  // A bot's computer, running: made from the current image if it has none, or when it is stopped and its image or
  // sizes changed. Its home stays. Calls at once share one start.
  function open(bot: string) {
    if (!starting.has(bot)) starting.set(bot, start(bot).then((name) => (used(bot), name)).finally(() => starting.delete(bot)));
    return starting.get(bot)!;
  }
  async function start(bot: string) {
    if (engine.state !== "ready") await check();
    if (engine.state !== "ready") throw new Error(notReady());
    const name = nameOf(bot);
    const info = await inspect(name);
    if (info?.State?.Running) return name;
    const tag = await image();
    const current = idOf((await json("GET", `/images/${tag}/json`)).Id);
    const sizes = limits();
    const stale = info && (idOf(info.Image) !== current || info.HostConfig?.Memory !== sizes.Memory || info.HostConfig?.NanoCpus !== sizes.NanoCpus);
    if (stale) await json("DELETE", `/containers/${name}?force=true`);
    if (!info || stale) {
      if ((await call("GET", `/volumes/${name}`)).status === 404) await json("POST", "/volumes/create", { Name: name, Labels: { "fxbot.computer": bot } });
      await json("POST", `/containers/create?name=${name}`, {
        Image: tag,
        Cmd: ["sleep", "infinity"],
        Env: env,
        WorkingDir: "/root",
        Hostname: "computer",
        Labels: { "fxbot.computer": bot },
        HostConfig: { Init: true, ...sizes, PidsLimit: 512, ShmSize: 512 * mib, Mounts: [{ Type: "volume", Source: name, Target: "/root" }] },
      });
      if (stale) void prune(tag).catch(() => {});
    }
    await json("POST", `/containers/${name}/start`);
    fx.log(`Started ${bot}'s computer`);
    return name;
  }

  // Skills with files, which a bot read: their files go to /skills/<name> before its next computer call.
  const noted = new Map<string, Set<string>>();
  const folderOf = (skill: string) => `/skills/${skill.replace(/[^\w.-]+/g, "_")}`;
  async function copySkills(bot: string, container: string) {
    const names = [...(noted.get(bot) ?? [])];
    noted.delete(bot);
    const files = names.flatMap((skill) =>
      fx.skills.files(bot, skill).map((f) => ({ path: `${folderOf(skill)}/${f.path}`, bytes: Buffer.from(f.text), mode: f.text.startsWith("#!") ? 0o755 : 0o644 })),
    );
    if (files.length) await put(container, files);
  }
  fx.on("tool.after", (event) => {
    const input = event.input as { name?: unknown; file?: unknown } | undefined;
    if (event.tool !== "skill" || event.error || typeof event.result !== "string" || typeof input?.name !== "string" || input.file) return;
    if (!fx.skills.files(event.bot, input.name).length) return;
    noted.set(event.bot, (noted.get(event.bot) ?? new Set()).add(input.name));
    event.result += `\n\nIts files are at ${folderOf(input.name)} on your computer.`;
    if (engine.state === "ready")
      void inspect(nameOf(event.bot))
        .then((info) => info?.State?.Running && copySkills(event.bot, nameOf(event.bot)))
        .catch(() => {});
  });
  // A computer that's ready for a call, with the skills the bot read since its last one.
  async function ready(bot: string) {
    const name = await open(bot);
    await copySkills(bot, name);
    return name;
  }

  fx.tool({
    name: "shell",
    description:
      "Run one bash command on your own computer: a Debian machine where you are root. Your home, /root, is kept; programs you install last " +
      "until the computer is rebuilt. Each call is a new shell in /root, stopped after timeout seconds (120 unless you give one, 600 at most). " +
      "Output over 60 KiB keeps its first 4 KiB and last 56 KiB, and says where the whole of it is. A server keeps running when started with " +
      "`setsid cmd > log 2>&1 &`, until the computer stops after sitting idle. The computer reaches the internet, but not this machine or its network.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string", description: "A bash command" }, timeout: { type: "integer", minimum: 1, maximum: 600, description: "Seconds before it is stopped" } },
      required: ["command"],
    },
    idempotent: false,
    async execute(input: { command?: unknown; timeout?: unknown }, { bot, signal }) {
      const command = typeof input?.command === "string" ? input.command : "";
      if (!command.trim()) return "Give a command to run.";
      const seconds = Math.min(Math.max(Math.trunc(Number(input.timeout) || 120), 1), 600);
      const name = await ready(bot);
      const id = randomUUID();
      const stop = () => void exec(name, ["sh", "-c", `kill -KILL -- -$(cat /tmp/fxbot/${id}.pid)`]).catch(() => {});
      signal.addEventListener("abort", stop, { once: true });
      busy.set(bot, (busy.get(bot) ?? 0) + 1);
      try {
        const { code, output } = await exec(name, ["fxbot-run", id, String(seconds), command], { timeout: (seconds + 60) * 1000 });
        return signal.aborted ? "Stopped: the turn was cancelled." : `exit ${code}\n${output}`;
      } finally {
        signal.removeEventListener("abort", stop);
        busy.set(bot, busy.get(bot)! - 1);
        used(bot);
      }
    },
  });

  fx.tool({
    name: "read_file",
    description:
      "Read a file on your computer. Text comes 2,000 lines or 60 KB at a time from offset, saying where the next part starts. An image " +
      "(PNG, JPEG, GIF, or WebP, up to 3.75 MiB) comes back as an image, which you see. A relative path starts at /root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, offset: { type: "integer", minimum: 1, description: "The first line, from 1" }, limit: { type: "integer", minimum: 1, maximum: 2000, description: "Lines" } },
      required: ["path"],
    },
    idempotent: true,
    async execute(input: { path?: unknown; offset?: unknown; limit?: unknown }, { bot }) {
      const path = where(input?.path);
      const bytes = await fetchFile(await ready(bot), path);
      const type = imageType(bytes);
      if (type)
        return bytes.length > maxImage
          ? `${path} is an image of ${sizeOf(bytes.length)}, over the 3.75 MiB you can look at. Make a smaller copy with computer_shell.`
          : { type: "libfx.tool-result", text: `${path}, ${sizeOf(bytes.length)}`, images: [{ type: "image", mimeType: type, data: bytes.toString("base64") }] };
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (text.includes("\0")) throw new Error();
      } catch {
        return `${path} is a binary file of ${sizeOf(bytes.length)}, not text or an image.`;
      }
      const lines = text.split("\n");
      const from = Math.max(Math.trunc(Number(input.offset) || 1), 1) - 1;
      const most = Math.min(Math.max(Math.trunc(Number(input.limit) || 2000), 1), 2000);
      let to = from;
      for (let kept = 0; to < lines.length && to - from < most && kept + Buffer.byteLength(lines[to]) + 1 <= page; to++) kept += Buffer.byteLength(lines[to]) + 1;
      // A line longer than a page is cut to it.
      const part = to === from && from < lines.length ? (to++, cutTo(lines[from], page)) : lines.slice(from, to).join("\n");
      return to < lines.length || from > 0 ? `${part}\n\n[lines ${from + 1} to ${to} of ${lines.length}${to < lines.length ? `; the next part starts at offset ${to + 1}` : ""}]` : part;
    },
  });

  fx.tool({
    name: "write_file",
    description: "Write a file on your computer, making its folders: text you give, up to 1 MiB, or a library item's bytes. A relative path starts at /root.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, text: { type: "string" }, library: { type: "string", description: "A library:<id> to write instead of text" } },
      required: ["path"],
    },
    idempotent: true,
    async execute(input: { path?: unknown; text?: unknown; library?: unknown }, { bot }) {
      const path = where(input?.path);
      let bytes: Buffer;
      if (typeof input.library === "string" && input.library.trim()) bytes = (await fx.library.read(bot, input.library.trim().replace(/^library:/, ""))).bytes;
      else if (typeof input.text === "string") bytes = Buffer.from(input.text, "utf8");
      else return "Give the text to write, or a library item as library.";
      if (typeof input.text === "string" && bytes.length > maxText) return "Text is at most 1 MiB. Write a longer file in parts, with computer_shell.";
      await put(await ready(bot), [{ path, bytes }]);
      return `Wrote ${bytes.length.toLocaleString("en-US")} bytes to ${path}.`;
    },
  });

  fx.tool({
    name: "to_library",
    description:
      "Save an image (PNG, JPEG, GIF, or WebP, up to 3.75 MiB) or a text file (up to 1 MiB) from your computer to this bot's library, where " +
      "the person sees it. Returns its library:<id>. The library keeps only images and text.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, name: { type: "string", description: "Its name in the library: the file's own unless given" } }, required: ["path"] },
    idempotent: true,
    async execute(input: { path?: unknown; name?: unknown }, { bot, session }) {
      const path = where(input?.path);
      const bytes = await fetchFile(await ready(bot), path);
      const image = imageType(bytes);
      if (bytes.length > (image ? maxImage : maxText)) return `Not saved: ${path} is ${sizeOf(bytes.length)}, over the library's ${image ? "3.75 MiB for an image" : "1 MiB for text"}.`;
      const name = (typeof input.name === "string" && input.name.trim()) || posix.basename(path);
      const type = image ?? textTypes[/\.(\w+)$/.exec(name)?.[1].toLowerCase() ?? ""] ?? "text/plain";
      try {
        const saved = await fx.library.save({ bot, session, name, type, bytes });
        return `Saved ${JSON.stringify(saved.name)} to the library as library:${saved.id}.`;
      } catch (error) {
        return `Not saved: ${(error as Error).message}.`;
      }
    },
  });

  // The engine: rootless, or refused. After a restart, its running computers count as just used.
  async function check() {
    engine = { state: "unreachable", socket: socket() };
    try {
      const [info, version] = await Promise.all([json("GET", "/info", undefined, 5000), json("GET", "/version", undefined, 5000)]);
      const podman = (version.Components ?? []).some((c: { Name: string }) => /podman/i.test(c.Name));
      engine = { ...engine, name: podman ? "podman" : "Docker", version: version.Version, state: (info.SecurityOptions ?? []).some((o: string) => o.includes("name=rootless")) ? "ready" : "rootful" };
      if (engine.state === "rootful") return fx.log("This engine runs as root. Run the computer's setup script.");
      for (const { bot, running } of await computers()) if (running && !last.has(bot)) used(bot);
      await forget();
    } catch (error) {
      engine.error = (error as Error).message;
    }
  }

  // What the page shows: the engine, the command that sets it up, the image, and each computer.
  async function status() {
    if (engine.state !== "ready") await check();
    const inContainer = existsSync("/run/.containerenv") || existsSync("/.dockerenv");
    const command = `sudo bash ${script}${inContainer ? "" : ` --user ${userInfo().username}`}`;
    const answer: Record<string, unknown> = { engine, command, building: build?.lines.slice(-40) ?? null, buildError };
    if (engine.state !== "ready") return answer;
    const tag = tagOf(steps());
    const made = await call("GET", `/images/${tag}/json`);
    answer.image = { tag, size: made.status === 200 ? JSON.parse(made.data.toString("utf8")).Size : null };
    const names = new Map((await fx.bots.list()).map((bot) => [bot.id, bot.name]));
    const homes = new Map<string, number>();
    try {
      for (const v of (await json("GET", "/system/df", undefined, 30_000)).Volumes ?? []) homes.set(v.Name, v.UsageData?.Size);
    } catch {}
    answer.computers = (await computers()).map(({ bot, running }) => ({ bot, name: names.get(bot) ?? bot, running, used: last.get(bot) ?? null, home: homes.get(nameOf(bot)) ?? null }));
    return answer;
  }
  const answer = async (work: () => Promise<unknown>) => {
    try {
      await work();
      return Response.json(await status());
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 });
    }
  };
  fx.route("GET", "/status", async () => Response.json(await status()));
  fx.route("GET", "/script", () => new Response(readFileSync(script, "utf8"), { headers: { "content-type": "text/plain; charset=utf-8" } }));
  fx.route("POST", "/rebuild", () => answer(async () => void image(true).catch(() => {})));
  fx.route("POST", "/bots/:id/stop", (_, { id }) =>
    answer(async () => {
      if (!isBot.test(id)) throw new Error("No such bot.");
      last.delete(id);
      await call("POST", `/containers/${nameOf(id)}/stop?t=5`, { timeout: 30_000 });
    }),
  );
  fx.route("POST", "/bots/:id/reset", (_, { id }) => answer(async () => (isBot.test(id) ? remove(id) : Promise.reject(new Error("No such bot.")))));
  fx.route("DELETE", "/computers", () => answer(async () => Promise.all((await computers()).map(({ bot }) => remove(bot)))));

  fx.on("settings", () => void check());
  // A plugin that needs the computer came, changed, or went: the image follows, in the background.
  fx.on("dependents", () => void (engine.state === "ready" && image().catch(() => {})));
  void check();
  return () => timer && clearInterval(timer);
}
