import { createHash } from "node:crypto";
import type { FxAgentTool } from "libfx";
import { createSkillsAdapter } from "libfx/skills";
import { parse } from "yaml";
import type { RepoFiles } from "./archive.ts";
import { cutBytes } from "./history.ts";
import { newId, type AddonRecord, type Store } from "./store.ts";
import type { AddonMark, SkillAddon, SkillFile, SkillPreview, SkillRef, SkillSource } from "./types.ts";

const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const hour = 60 * 60 * 1000;
const maxSkill = 2 * 1024 * 1024;
// libfx refuses a host tool's result over 64 KiB of UTF-8, so a long file is read in parts.
const partBytes = 60 * 1024;
const skillIdOf = /^([A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100})\/([A-Za-z0-9._-]{1,100})$/;

type Archives = { head(repo: string): Promise<string>; files(repo: string, commit: string): Promise<RepoFiles> };
type Config = { files: SkillFile[]; license?: string };
type SkillRecord = AddonRecord<Config> & { source: SkillSource };
// libfx's SkillRecord, as kept in Postgres, with `manual` for a skill only a person calls by name.
type Row = { addonId: string; name: string; description: string; instructions: string; resources: { uri: string; text: string }[]; manual: boolean };

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const bytes = (text: string) => Buffer.byteLength(text);
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A SKILL.md's frontmatter, read as YAML, and its body. libfx's own loader reads a folded or quoted description, or a
// file with Windows line ends, wrongly (libfx 0.0.16, checked by hand). The Agent Skills limits apply.
export function parseSkill(text: string) {
  const found = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  if (!found) return { error: "Its SKILL.md has no frontmatter." };
  let meta: unknown;
  try {
    meta = parse(found[1]);
  } catch (error) {
    return { error: `Its frontmatter isn't YAML: ${(error as Error).message.split("\n")[0]}` };
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return { error: "Its frontmatter isn't a map of fields." };
  const { name, description, license } = meta as Record<string, unknown>;
  if (typeof name !== "string" || name.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return { error: "Its name must be up to 64 lowercase letters, digits, and single hyphens." };
  if (typeof description !== "string" || !description.trim() || description.length > 1024) return { error: "Its description must be 1 to 1024 characters." };
  return {
    name,
    description: description.trim(),
    body: (found[2] ?? "").replace(/\r\n/g, "\n").trim(),
    ...(typeof license === "string" ? { license: license.slice(0, 500) } : {}),
    // Claude Code's field for a skill a person calls by name, never the model on its own.
    manual: (meta as Record<string, unknown>)["disable-model-invocation"] === true,
  };
}

// The skill as `npx skills` finds it: a SKILL.md up to 5 folders deep whose name is the skillId, or else whose folder
// is. Its folder's files are the skill's, except those of another skill inside it.
function findSkill(files: RepoFiles, repo: string, skillId: string) {
  const folderOf = (path: string) => path.slice(0, -"SKILL.md".length).replace(/\/$/, "");
  const found = [...files.text.keys()].filter((p) => (p === "SKILL.md" || p.endsWith("/SKILL.md")) && p.split("/").length <= 6);
  const nameOf = (path: string) => /^name:\s*["']?([^"'\r\n]*?)["']?\s*$/m.exec(files.text.get(path)!.slice(0, 2000))?.[1];
  const path =
    found.find((p) => nameOf(p) === skillId) ?? found.find((p) => (folderOf(p).split("/").pop() || repo.split("/")[1]) === skillId);
  if (!path) return undefined;
  const folder = folderOf(path);
  const nested = found.map(folderOf).filter((f) => f !== folder && (folder === "" || f.startsWith(`${folder}/`)));
  const inside = (p: string) => (folder === "" || p.startsWith(`${folder}/`)) && !nested.some((f) => p.startsWith(`${f}/`));
  const relative = (p: string) => (folder ? p.slice(folder.length + 1) : p);
  return { path, inside, relative };
}

// Skills as add-ons: one skill each, from a GitHub repository at a pinned commit. Each bot's catalog lists the skills
// it has, and the `skill` tool reads one when a task needs it. A change that adds the first skill or removes the last
// rebuilds the agents, since only then does the tool come or go.
export async function createSkills({ store, archives, fromOf, onChange }: { store: Store; archives: Archives; fromOf: (skill: string) => SkillSource["from"]; onChange: () => void }) {
  const { sql } = store;
  const records = new Map((await store.addons.list()).filter((r) => r.kind === "skill").map((r) => [r.id, r as SkillRecord]));
  const rows = new Map((await sql<Row[]>`select addon_id, name, description, instructions, resources, manual from skills`).map((r) => [r.addonId, r]));
  const on = new Map<string, Set<string>>();
  for (const { profileId, addonId } of await store.addons.on()) if (records.has(addonId)) on.set(addonId, (on.get(addonId) ?? new Set()).add(profileId));
  const marks = new Map<string, AddonMark>();
  // A commit the hourly check found the skill unchanged at, so it isn't read again.
  const same = new Map<string, string>();
  const get = (id: string) => records.get(id) ?? fail(404, "add-on not found");
  const any = () => [...records.values()].some((r) => r.enabled);

  function view(record: SkillRecord): SkillAddon {
    const row = rows.get(record.id);
    return {
      id: record.id,
      kind: "skill",
      name: record.name,
      enabled: record.enabled,
      bots: record.bots,
      on: [...(on.get(record.id) ?? [])],
      status: "",
      source: record.source,
      description: row?.description ?? "",
      files: record.config.files,
      ...(record.config.license ? { license: record.config.license } : {}),
      ...(row?.manual ? { manual: true } : {}),
      ...(marks.has(record.id) ? { mark: marks.get(record.id) } : {}),
    };
  }

  // A skill's page at its repository's current commit, or at `commit`, and the record Add would save.
  async function look(ref: SkillRef, commit?: string) {
    const id = typeof ref?.skill === "string" ? ref.skill : "";
    const [, repo, skillId] = skillIdOf.exec(id) ?? fail(400, "skill must be <owner>/<repo>/<skillId>");
    const from = ref.from === "fxbot" || ref.from === "skills.sh" ? ref.from : fromOf(id);
    const at = commit ?? (await archives.head(repo).catch((error: Error) => fail(502, error.message)));
    const files = await archives.files(repo, at).catch((error: Error) => fail(502, error.message));
    const source: SkillSource = { skill: id, commit: at, from };
    const page: SkillPreview = { hash: "", name: skillId, description: "", source, text: "", files: [], skipped: [] };
    const found = findSkill(files, repo, skillId);
    if (!found) return { page: { ...page, error: `${repo} has no skill ${skillId} at ${at.slice(0, 7)}.` } };
    const text = files.text.get(found.path)!;
    const others = [...files.text].filter(([p]) => p !== found.path && found.inside(p)).sort(([a], [b]) => (a < b ? -1 : 1));
    page.text = text;
    page.files = [["SKILL.md", text] as const, ...others.map(([p, t]) => [found.relative(p), t] as const)].map(([path, t]) => ({ path, size: bytes(t), hash: sha(t).slice(0, 12) }));
    page.skipped = [...files.skipped].filter(([p]) => found.inside(p)).map(([p, why]) => ({ path: found.relative(p), why }));
    const parsed = parseSkill(text);
    if ("error" in parsed) return { page: { ...page, error: parsed.error } };
    Object.assign(page, { name: parsed.name, description: parsed.description, ...(parsed.license ? { license: parsed.license } : {}), ...(parsed.manual ? { manual: true } : {}) });
    if (page.files.reduce((n, f) => n + f.size, 0) > maxSkill) return { page: { ...page, error: `It is over ${maxSkill / 1024 / 1024} MiB.` } };
    page.hash = sha(JSON.stringify([parsed.name, text, ...others.map(([p, t]) => [found.relative(p), t])]));
    const resources = others.map(([p, t]) => ({ uri: `skill://${parsed.name}/${found.relative(p)}`, text: t }));
    return { page, row: { name: parsed.name, description: parsed.description, instructions: parsed.body, resources, manual: parsed.manual } };
  }

  async function saveRow(addonId: string, row: Omit<Row, "addonId">) {
    await sql`insert into skills (addon_id, name, description, instructions, resources, manual)
      values (${addonId}, ${row.name}, ${row.description}, ${row.instructions}, ${sql.json(row.resources)}, ${row.manual})
      on conflict (addon_id, name) do update set description = excluded.description, instructions = excluded.instructions,
        resources = excluded.resources, manual = excluded.manual`;
    await sql`delete from skills where addon_id = ${addonId} and name <> ${row.name}`;
    rows.set(addonId, { addonId, ...row });
  }

  // Every hour: each repository's HEAD, once. When it moved, the skill is read again there, and marked only when its
  // files changed, or it is gone.
  async function check() {
    const repos = new Map<string, SkillRecord[]>();
    for (const r of records.values()) {
      const repo = skillIdOf.exec(r.source.skill)![1];
      repos.set(repo, [...(repos.get(repo) ?? []), r]);
    }
    for (const [repo, list] of repos) {
      const head = await archives.head(repo).catch(() => null);
      if (!head) continue;
      for (const record of list) {
        if (record.source.commit === head || same.get(record.id) === head) continue;
        const looked = await look({ skill: record.source.skill, from: record.source.from }, head).catch(() => null);
        if (!looked) continue;
        const { page } = looked;
        if (page.error?.includes("has no skill")) marks.set(record.id, { kind: "removed" });
        else if (page.hash && page.hash !== record.approvedHash) marks.set(record.id, { kind: "update", version: head.slice(0, 7) });
        else (marks.delete(record.id), same.set(record.id, head));
      }
    }
  }
  const timer = setInterval(() => void check().catch(() => {}), hour);
  timer.unref();
  const first = setTimeout(() => void check().catch(() => {}), 60_000);
  first.unref();

  // A bot's skills, in the order they were added. A name two skills share is shown as the later one's id.
  function forBot(bot: string) {
    const seen = new Set<string>();
    const all = [...records.values()].flatMap((r) => {
      const row = rows.get(r.id);
      if (!row) return [];
      const name = seen.has(row.name) ? r.source.skill : row.name;
      seen.add(row.name);
      return [{ record: r, row, name }];
    });
    return all.filter(({ record }) => record.enabled && (record.bots === "all" || on.get(record.id)?.has(bot)));
  }

  const tool: FxAgentTool = {
    name: "skill",
    description:
      "Load one of this bot's skills: instructions for a kind of task, read only when a task needs them. With name: the skill's " +
      "instructions and a list of its files. With name and file: one of those files, in parts of 60 KB from part 1. With search: up to " +
      "10 of this bot's skills whose name or description matches.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "A skill's name, from the list of skills in your instructions" },
        file: { type: "string", description: "One of the skill's files, such as references/forms.md" },
        part: { type: "integer", minimum: 1 },
        search: { type: "string", description: "Words to find a skill by" },
      },
    },
    idempotent: true,
    async execute(input: { name?: unknown; file?: unknown; part?: unknown; search?: unknown }, call) {
      // The bot is the session's, never the model's to choose.
      const bot = (call.context as { bot?: string } | undefined)?.bot;
      if (!bot) return "Skills are unavailable in this chat.";
      const mine = forBot(bot);
      if (typeof input.search === "string" && input.search.trim()) {
        const words = input.search.toLowerCase().split(/\s+/).filter(Boolean);
        const found = mine.filter(({ name, row }) => words.some((w) => `${name} ${row.description}`.toLowerCase().includes(w))).slice(0, 10);
        return found.length ? found.map(({ name, row }) => `${name}: ${row.description}`).join("\n") : "No skill of this bot's matches.";
      }
      const asked = String(input.name ?? "").trim();
      const skill = mine.find((s) => s.name === asked);
      if (!skill) {
        if ([...records.values()].some((r) => rows.get(r.id)?.name === asked || r.source.skill === asked)) return `${asked} is off for this bot.`;
        const closest = mine.map((s) => s.name).sort((a, b) => distance(a, asked) - distance(b, asked)).slice(0, 3);
        return `This bot has no skill named ${asked || "that"}.${closest.length ? ` The closest: ${closest.join(", ")}.` : ""}`;
      }
      if (typeof input.file === "string" && input.file.trim()) {
        const uri = `skill://${skill.row.name}/${input.file.trim().replace(/^\/+/, "")}`;
        const resource = skill.row.resources.find((r) => r.uri === uri) ?? skill.row.resources.find((r) => r.uri.endsWith(`/${input.file}`));
        if (!resource) return `${skill.name} has no file ${input.file}. Its files: ${skill.row.resources.map((r) => r.uri.split("/").slice(3).join("/")).join(", ") || "none"}.`;
        return paged(resource.text, Math.max(1, Math.trunc(Number(input.part) || 1)));
      }
      return paged(render(skill), Math.max(1, Math.trunc(Number(input.part) || 1)));
    },
  };

  // The skills a person names in a message: `$name` anywhere, or `/name` at its start, of those on for the bot.
  function mentioned(bot: string, text: string) {
    const mine = new Map(forBot(bot).map((s) => [s.name, s]));
    const names = [...(/^\/([\w./-]+)/.exec(text)?.slice(1) ?? []), ...[...text.matchAll(/(?:^|\s)\$([\w./-]+)/g)].map((m) => m[1])].map((n) => n.replace(/[.,:;!?)]+$/, ""));
    return [...new Set(names)].flatMap((n) => (mine.has(n) ? [mine.get(n)!] : []));
  }

  return {
    tool,
    any,
    has: (id: string) => records.has(id),
    list: () => [...records.values()].map(view),
    preview: async (ref: SkillRef) => (await look(ref)).page,
    check,

    // A bot's list of skills for its instructions: every name, and descriptions in the order skills were added until
    // `budget` characters run out. Skills only a person calls are named after it, to load when the person asks for one.
    // No skills, no list.
    catalog(bot: string, budget: number) {
      const all = forBot(bot);
      const mine = all.filter(({ row }) => !row.manual);
      const manual = all.filter(({ row }) => row.manual).map(({ name }) => name);
      if (!all.length) return "";
      let left = budget;
      let dropped = false;
      const items = mine.map(({ name, row }) => {
        const description = escape(row.description);
        if (description.length > left) return (dropped = true), `<skill><name>${escape(name)}</name></skill>`;
        left -= description.length;
        return `<skill><name>${escape(name)}</name><description>${description}</description></skill>`;
      });
      return [
        ...(mine.length
          ? [
              "The following skills provide specialized instructions for specific tasks.",
              "When a task matches a skill's description, call the skill tool with the skill's name to load its full instructions.",
              "<available_skills>",
              ...items,
              "</available_skills>",
              ...(dropped ? ["Some descriptions are left out. Find a skill by what it does with the skill tool's search."] : []),
            ]
          : []),
        ...(manual.length ? [`Load these skills with the skill tool only when the person asks for one by name: ${manual.join(", ")}.`] : []),
      ].join("\n");
    },
    countFor: (bot: string) => forBot(bot).length,
    // A bot's skills, for the picker in its chat: names a person can use as $name or /name.
    listFor: (bot: string) => forBot(bot).map(({ name, row }) => ({ name, description: row.description, ...(row.manual ? { manual: true } : {}) })),
    // The skills a message names, as prompt blocks: each one's instructions as a skill:// resource, rendered as the
    // skill tool renders it, so a skill the person names is loaded for sure, and stays in the chat's history.
    invoked: (bot: string, text: string) =>
      mentioned(bot, text).map((skill) => ({ type: "resource" as const, resource: { uri: `skill://${skill.name}/SKILL.md`, text: paged(render(skill), 1) } })),

    async add(ref: SkillRef, hash: unknown) {
      const { page, row } = await look(ref);
      if (page.error || !row) return fail(400, page.error ?? "This skill can't be added.");
      if (hash !== page.hash) fail(409, "This skill changed since its page was shown. Look at it again before adding.");
      if ([...records.values()].some((r) => r.source.skill === page.source.skill)) fail(409, `${page.name} is already added.`);
      const before = any();
      const record: SkillRecord = { id: newId(), kind: "skill", name: page.name, source: page.source, config: { files: page.files, ...(page.license ? { license: page.license } : {}) }, approvedHash: page.hash, enabled: true, bots: "all", allowed: null, status: null };
      await store.addons.create(record);
      await saveRow(record.id, row);
      records.set(record.id, record);
      if (any() !== before) onChange();
      return view(record);
    },
    // Moves a skill to its repository's current commit, once the owner has seen what changed there.
    async update(id: string, hash: unknown) {
      const record = get(id);
      const { page, row } = await look({ skill: record.source.skill, from: record.source.from });
      if (page.error || !row) return fail(400, page.error ?? "This skill can't be updated.");
      if (hash !== page.hash) fail(409, "This skill changed since its page was shown. Look at it again before updating.");
      const config: Config = { files: page.files, ...(page.license ? { license: page.license } : {}) };
      await store.addons.update(id, { source: page.source, config, approvedHash: page.hash });
      await saveRow(id, row);
      Object.assign(record, { name: page.name, source: page.source, config, approvedHash: page.hash });
      marks.delete(id);
      same.delete(id);
      return view(record);
    },
    // On or off, and for every bot or chosen ones.
    async change(id: string, input: { enabled?: unknown; bots?: unknown }) {
      const record = get(id);
      const { enabled, bots } = input ?? {};
      if (enabled !== undefined && typeof enabled !== "boolean") fail(400, "enabled must be true or false");
      if (bots !== undefined && bots !== "all" && bots !== "each") fail(400, "bots must be all or each");
      const before = any();
      const fields = { ...(enabled === undefined ? {} : { enabled: enabled as boolean }), ...(bots === undefined ? {} : { bots: bots as SkillRecord["bots"] }) };
      await store.addons.update(id, fields);
      Object.assign(record, fields);
      if (any() !== before) onChange();
      return view(record);
    },
    async forBot(profileId: string, addonId: string, enabled: unknown) {
      const record = get(addonId);
      if (typeof enabled !== "boolean") fail(400, "enabled must be true or false");
      await store.addons.forBot(profileId, addonId, enabled as boolean);
      const bots = on.get(addonId) ?? new Set<string>();
      if (enabled) bots.add(profileId);
      else bots.delete(profileId);
      on.set(addonId, bots);
      return view(record);
    },
    async remove(id: string) {
      get(id);
      const before = any();
      await store.addons.remove(id);
      for (const map of [records, rows, on, marks, same]) map.delete(id);
      if (any() !== before) onChange();
    },
    // One of an installed skill's files, for its page. SKILL.md comes back as its frontmatter's name and description,
    // then its body.
    read(id: string, file: unknown) {
      get(id);
      const row = rows.get(id) ?? fail(404, "skill not found");
      if (file === undefined || file === "" || file === "SKILL.md") return `---\nname: ${row.name}\ndescription: ${JSON.stringify(row.description)}\n---\n\n${row.instructions}\n`;
      return row.resources.find((r) => r.uri === `skill://${row.name}/${file}`)?.text ?? fail(404, `${row.name} has no file ${String(file)}.`);
    },
    close: () => (clearInterval(timer), clearTimeout(first)),
  };
}

// libfx's own rendering of a skill, with its files listed instead of inlined.
function render(skill: { name: string; row: Row }) {
  const record = { name: skill.name, description: skill.row.description, instructions: skill.row.instructions };
  let text: string;
  try {
    text = createSkillsAdapter([record]).instructions;
  } catch {
    text = `<skill name="${skill.name}">\n<description>${skill.row.description}</description>\n${skill.row.instructions}\n</skill>`;
  }
  const files = skill.row.resources.map((r) => r.uri.split("/").slice(3).join("/"));
  return `${text}${files.length ? `\n\nIts files, to read with file: ${files.join(", ")}` : ""}`;
}

// A part of a long text, cut at a whole character, and where the rest is.
function paged(text: string, part: number) {
  const all = Buffer.from(text);
  if (all.length <= partBytes) return part === 1 ? text : "There is no such part.";
  let start = 0;
  for (let i = 1; i < part && start < all.length; i++) start += Buffer.byteLength(cutBytes(all.subarray(start).toString(), partBytes));
  if (start >= all.length) return "There is no such part.";
  const piece = cutBytes(all.subarray(start).toString(), partBytes);
  const more = start + Buffer.byteLength(piece) < all.length;
  return `${piece}${more ? `\n\n[Part ${part}. The rest follows in part ${part + 1}.]` : `\n\n[Part ${part}, the last.]`}`;
}

// How many single-character edits turn one name into another, for the closest names to one that isn't there.
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
