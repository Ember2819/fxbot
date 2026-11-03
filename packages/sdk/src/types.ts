// What the agent side and the client share. No imports, so a browser bundle can take them.

// A bot's look: one of these shapes, in one of these colors. A UI draws them; the names are the contract.
export const shapes = ["circle", "cloud", "squircle", "star", "clover", "heart", "flower", "egg", "bean", "triangle", "diamond", "sparkle", "hexagon", "pumpkin"] as const;
export type Shape = (typeof shapes)[number];
export const colors = {
  black: "#1f1f1f",
  brown: "#9b6a3f",
  red: "#e5484d",
  orange: "#f06b2b",
  amber: "#ec9a2e",
  green: "#56bf73",
  teal: "#4fb3a2",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  pink: "#e64ba0",
  gray: "#9a9a9a",
} as const;
export type Color = keyof typeof colors;

// `provider` is a provider id, or empty for none. An empty model follows the provider's default model.
export type Fields = { name: string; instructions: string; model: string; provider: string; shape: Shape; color: Color };
// `preview` is the start of the latest reply, for a list of bots. `handoff` is the summary a provider switch carried
// over, which the current chat starts from. `busy` is true while a turn runs. Pinned bots head the list.
export type Profile = Fields & { id: string; sessionId: string | null; preview: string | null; handoff: string | null; busy: boolean; pinned: boolean };
// An update takes any field, and `pinned`. The first bot starts pinned, and at most `maxPinned` are.
export type ProfileUpdate = Partial<Fields> & { pinned?: boolean };
export const maxPinned = 3;
// New bots start on `defaultProvider`. Memory search's vectors come from `embedder`: the machine's local embedder, a
// provider's /embeddings (`embeddingProvider` and `embeddingModel`), or none. `messageVectors` is how many characters of
// each message are embedded, and 0 embeds none.
export type Embedder = "local" | "remote" | "off";
export type Settings = { defaultProvider: string; embedder: Embedder; embeddingProvider: string; embeddingModel: string; messageVectors: number };
// What the machine runs as its local embedder, in an install made by setup.sh.
export type LocalEmbedder = "cpu" | "gpu" | "off";
// How far memory search's vectors have got: the model in use, or null when it's off or not answering, the counts, and
// the fill-in's last error. `local` and `switching` come from the machine: what it runs, and a change it is making or
// why that failed. `canSwitch` is whether Settings can ask it for one.
export type EmbeddingStatus = {
  model: string | null;
  error: string | null;
  messages: number;
  withVectors: number;
  memories: number;
  memoriesWithVectors: number;
  local: LocalEmbedder | null;
  switching: { to: LocalEmbedder; error?: string } | null;
  canSwitch: boolean;
};
// The provider kinds that serve OpenAI's /embeddings.
export const embeddingKinds = ["openai", "openrouter", "gateway", "vercel", "ollama", "lmstudio", "custom"] as const;
// One fact a bot keeps: saved by the bot during a turn (with the message that started it), or added by the owner.
export type Memory = { id: string; text: string; savedBy: "bot" | "owner"; messageId: string | null; createdAt: string; updatedAt: string };

// A release of fxbot: its version, its notes, and its page.
export type Release = { version: string; notes: string; url: string };
// The running version, the newest release when it is newer, and whether Settings can update to it: only in an install
// made by setup.sh, where the machine carries out the update. `updating` is its steps so far, and its error.
export type UpdateStatus = {
  version: string;
  latest: Release | null;
  canUpdate: boolean;
  updating: { to: string; steps: string[]; error?: string } | null;
};

// A file sent with a message: `data` is base64 on the way in, and `url` is its library file once fxbot keeps it.
export type Upload = { name: string; type: string; url?: string; data?: string };
// What a message sends. The same `messageId` again reaches the same turn and runs nothing new.
export type Message = { text: string; messageId: string; files?: Upload[] };
// libfx's stream leaves out a prompt that is not plain text, so fxbot keeps what such a message sent.
export type Sent = { input: string; files: Upload[]; plugin?: string | null };

// The library keeps one copy of each file, by the SHA-256 of its bytes, tagged with every bot and chat that saved it.
// `uploaded` came from the person, `generated` from a bot. Later phases add more kinds.
export const itemKinds = ["image", "document"] as const;
export type ItemKind = (typeof itemKinds)[number];
// `profileIds` are the bots of the tags a listing covers, null for a removed bot. `savedAt` is the newest of those
// tags, and `preview` the start of a document's text. Dates are ISO strings to the microsecond.
export type LibraryItem = {
  id: string;
  kind: ItemKind;
  origin: "uploaded" | "generated";
  name: string;
  type: string;
  size: number;
  profileIds: (string | null)[];
  preview: string;
  createdAt: string;
  savedAt: string;
  url: string;
};
// Newest saved first. `profileId` narrows to one bot's tags, and `before` is a page's `next`.
export type LibraryQuery = { q?: string; profileId?: string; kind?: ItemKind; before?: string; limit?: number };
export type LibraryPage = { items: LibraryItem[]; next: string | null };

// How each kind of provider connects: a device code sign-in, an API key at a fixed address, or a server's address.
export const kinds = {
  chatgpt: { label: "ChatGPT plan", connect: "device" },
  grok: { label: "Grok plan", connect: "device" },
  vercel: { label: "Vercel account", connect: "device" },
  gateway: { label: "AI Gateway key", connect: "key" },
  openai: { label: "OpenAI key", connect: "key", baseUrl: "https://api.openai.com/v1" },
  opencode: { label: "OpenCode Zen key", connect: "key", baseUrl: "https://opencode.ai/inference/openai/v1" },
  "opencode-go": { label: "OpenCode Go key", connect: "key", baseUrl: "https://opencode.ai/inference/go/openai/v1" },
  openrouter: { label: "OpenRouter key", connect: "key", baseUrl: "https://openrouter.ai/api/v1" },
  ollama: { label: "Ollama", connect: "url", baseUrl: "http://localhost:11434/v1" },
  lmstudio: { label: "LM Studio", connect: "url", baseUrl: "http://localhost:1234/v1" },
  custom: { label: "Other server", connect: "url" },
} as const satisfies Record<string, { label: string; connect: "device" | "key" | "url"; baseUrl?: string }>;
export type Kind = keyof typeof kinds;

// A provider as listed: never its key or tokens, only whether it holds them. `contextWindow` overrides what the
// server reports for its models.
export type Provider = {
  id: string;
  kind: Kind;
  name: string;
  baseUrl: string | null;
  model: string;
  contextWindow: number | null;
  teamId: string | null;
  hasKey: boolean;
  signedIn: boolean;
  error: string | null;
};
export type NewProvider = { kind: Kind; name?: string; baseUrl?: string; apiKey?: string; model?: string; contextWindow?: number | null };
export type ProviderUpdate = { name?: string; baseUrl?: string; apiKey?: string; model?: string; contextWindow?: number | null; teamId?: string };

// What fxbot knows about a model. A field the provider does not report stays unset.
export type Model = { id: string; name?: string; contextWindow?: number; maxOutputTokens?: number; supportsToolUse?: boolean; supportsVision?: boolean };
export type Team = { id: string; name: string };

// A device code sign-in as the page sees it: where to go and the code to enter, never what claims the tokens.
export type SignIn = { id: string; verificationUrl: string; userCode: string; expiresAt: number };
export type SignInStatus = { status: "waiting" | "done" | "failed"; provider?: string; error?: string };

// An add-on gives bots more to use: a remote MCP server, or a skill. `bots` is "all", or "each" for only the bots in
// `on`. `status` says what it waits for, if anything. A mark is what the hourly check found.
type AddonCommon = { id: string; name: string; enabled: boolean; bots: "all" | "each"; on: string[]; status: string; mark?: AddonMark };
// A remote MCP server. `auth` is how it signs in: not at all, with headers whose values fxbot keeps sealed, or with
// OAuth. `signedIn` says it has its token or header values. Bots get only the tools in `allowed`, which are the
// read-only ones until the person picks. Its `status` says "Connected" once it is.
export type AddonTool = { name: string; description: string; readOnly: boolean };
export type Transport = "streamable-http" | "sse";
export type McpAddon = AddonCommon & {
  kind: "mcp";
  url: string;
  transport: Transport;
  auth: "none" | "headers" | "oauth";
  headers: string[];
  allowLocal: boolean;
  allowed: string[];
  tools: AddonTool[];
  signedIn: boolean;
  ownClient: boolean;
  /** The registry entry it was added from, its version then, and where it came from. */
  source?: { registry: string; version: string; from: AddonFrom };
  /** What its source says about it now. */
  info?: AddonInfo;
};
// A skill, installed as skills.sh installs it: `<owner>/<repo>/<skillId>`, from the repository at `commit`, found in
// fxbot's own list or on skills.sh.
export type SkillSource = { skill: string; commit: string; from: "fxbot" | "skills.sh" };
// A file of a skill: its path in the skill's folder, its size, and a hash of it, to show what an update changes.
export type SkillFile = { path: string; size: number; hash: string };
// A skill as installed. `manual` is one only a person calls by name, which bots don't see in their list.
export type SkillAddon = AddonCommon & { kind: "skill"; source: SkillSource; description: string; files: SkillFile[]; license?: string; manual?: boolean };
// A plugin: code that changes fxbot itself, from a GitHub repository's folder at a pinned commit, or in a checkout from
// a folder of FXBOT_PLUGIN_DIRS. `parts` is what it registered when it loaded; `error` is why it is off.
export type PluginSource = { local: string } | { repo: string; path: string; commit: string; from: "fxbot" | "github" };
export type PluginSetting = { name: string; description: string; default?: string; isRequired?: boolean; isSecret?: boolean };
export type PluginParts = { tools: string[]; hooks: string[]; routes: string[]; page: boolean };
export type PluginAddon = AddonCommon & {
  kind: "plugin";
  source: PluginSource;
  version: string;
  description: string;
  /** Its files when it was added or updated, to show what an update changes. A local plugin's aren't kept. */
  files: SkillFile[];
  /** The MCP servers it added, which go when it does. */
  servers: string[];
  /** Its settings, with each value but a secret's, which says only whether it is set. */
  settings: (PluginSetting & { value?: string; set: boolean })[];
  parts: PluginParts;
  error?: string;
};
export type Addon = McpAddon | SkillAddon | PluginAddon;
// A plugin by its GitHub repository and the folder it's in: `<owner>/<repo>`, or `<owner>/<repo>/<folder>`.
export type PluginRef = { plugin: string; from?: "fxbot" | "github" };
// A plugin's page, from its repository's current commit: what it is, the files that run inside fxbot, and the rest of
// what it carries, with the text of each file the page can show. Add sends `hash` back, and fails if the plugin
// changed since. One that can't be added has an `error`. For an installed plugin, `changed` lists what an update
// changes.
export type PluginPreview = {
  hash: string;
  name: string;
  version: string;
  description: string;
  source: { repo: string; path: string; commit: string; from: "fxbot" | "github" };
  files: SkillFile[];
  skipped: { path: string; why: string }[];
  /** The files that run inside fxbot: its server and page code. */
  code: string[];
  /** The text of plugin.json, its code, its CSS, and its migrations, by path. */
  texts: Record<string, string>;
  settings: PluginSetting[];
  migrations: string[];
  skills: string[];
  /** Its MCP servers. Remote ones are added with it; one that runs a command isn't used yet. */
  servers: { name: string; url?: string; used: boolean }[];
  changed?: { path: string; change: "changed" | "added" | "removed" }[];
  error?: string;
};
// A plugin in fxbot's own list.
export type PluginCard = { kind: "plugin"; name: string; description: string; ref: string; from: "fxbot" };
export type PluginSearch = { cards: PluginCard[] };
// What the page loads for a running plugin: its page code and its CSS, by URL.
export type PluginPage = { name: string; version: string; page?: string; css?: string };
// Where a registry entry comes from: fxbot's own list, GitHub's registry, or the official one, unmoderated.
export type AddonFrom = "fxbot" | "github" | "official";
// What the page asks to add: a server by its URL, with the names of any headers it needs, or a registry entry, from
// GitHub's registry unless `from` says otherwise.
export type AddonRef =
  | { url: string; transport?: Transport; headers?: string[]; allowLocal?: boolean }
  | { registry: string; version?: string; allowLocal?: boolean; from?: AddonFrom }
  | SkillRef
  | PluginRef;
// A skill by its skills.sh id, `<owner>/<repo>/<skillId>`, as found in fxbot's list or on skills.sh.
export type SkillRef = { skill: string; from?: SkillSource["from"] };
// The add-on page: what probing the server found, and for a registry entry, what the registry says about it. Add sends
// `hash` back, and fails if the server changed since. `local` is an entry that runs only on this machine, which can't
// be added before plugins.
export type AddonPreview = Omit<McpAddon, "id" | "kind" | "headers" | "enabled" | "bots" | "on" | "allowed" | "status" | "tools" | "signedIn" | "ownClient" | "source" | "mark"> & {
  hash: string;
  headers: { name: string; secret: boolean; description?: string }[];
  tools: AddonTool[] | null;
  local?: boolean;
};
// A skill's page, from its repository's current commit: its SKILL.md in full, its other files, and the files passed
// over and why. Add sends `hash` back, and fails if the skill changed since. A skill that can't be added has an `error`
// and no hash.
export type SkillPreview = {
  hash: string;
  name: string;
  description: string;
  source: SkillSource;
  text: string;
  files: SkillFile[];
  skipped: { path: string; why: string }[];
  license?: string;
  manual?: boolean;
  error?: string;
};
// A registry entry as the registry describes it. `namespace` is its publisher, verified by the registry; `domain` is
// the domain a reverse-DNS namespace names, which a remote's host should be on.
export type AddonInfo = {
  name: string;
  namespace: string;
  domain?: string;
  title: string;
  description: string;
  version: string;
  repository?: string;
  website?: string;
  license?: string;
  stars?: number;
  status: "active" | "deprecated" | "deleted";
  from: AddonFrom;
};
// A search result. `url` and `host` are its remote's, and `hostMatches` whether it is on the namespace's domain, when
// the namespace names one. `needs` is "key" when the entry asks for a secret header; a sign-in is learned on its page.
// `local` runs only on this machine.
export type AddonCard = AddonInfo & { kind: "mcp"; url?: string; host?: string; hostMatches?: boolean; needs?: "key"; local?: boolean };
// What the hourly check found about an installed add-on. It changes nothing by itself.
export type AddonMark = { kind: "update"; version: string } | { kind: "deprecated" } | { kind: "removed" };
// A search's cards, and the mirror's state: when it last synced, and why the last try failed.
export type AddonSearch = { cards: AddonCard[]; syncedAt: string | null; error?: string; everythingError?: string };
// A skill found in fxbot's list or on skills.sh. skills.sh gives installs but no description; fxbot's list gives one.
export type SkillCard = { kind: "skill"; id: string; name: string; repository: string; from: SkillSource["from"]; description?: string; installs?: number };
export type SkillSearch = { cards: SkillCard[]; error?: string };
// A skill a bot has, as its chat's picker lists it: `$name` in a message, or `/name` at its start, sends it along.
export type BotSkill = { name: string; description: string; manual?: boolean };
// Write-only: header values, or the person's own OAuth client for a server that registers none itself.
export type AddonSecrets = { headers?: Record<string, string>; clientId?: string; clientSecret?: string };
// An OAuth sign-in as the page sees it. "redirect" comes back on its own; "paste" needs the address of the page that
// failed to load.
export type OAuthAttempt = { id: string; url: string; mode: "redirect" | "paste"; expiresAt: number };
export type OAuthStatus = { status: "waiting" | "done" | "failed"; error?: string };

// One line of a bot's NDJSON stream, as far as fxbot reads it. libfx writes more types and fields.
export type StreamLine = {
  type: string;
  messageId?: string;
  /** A turn's message on `turn_start`, or a tool's arguments on `tool_start`. */
  input?: unknown;
  files?: Upload[];
  delta?: string;
  /** A tool call: `id` pairs `tool_start` with `tool_end`. A large input comes as a preview instead. */
  id?: string;
  name?: string;
  inputPreview?: string;
  content?: string;
  isError?: boolean;
  stopReason?: string;
  error?: { message: string };
  cursor?: number;
  epoch?: number;
  /** On `turn_start`: the plugin that sent the message, when one did. */
  from?: string;
};
