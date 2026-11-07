// What the agent side and the client share. No imports, so a browser bundle can take them.

// A bot's look: one of these shapes, in one of these colors, with a feeling and what it wears. A UI draws them; the names
// are the contract.
export const shapes = ["circle", "cloud", "squircle", "star", "clover", "heart", "flower", "egg", "bean", "triangle", "diamond", "sparkle", "hexagon", "pumpkin", "mochi", "gumdrop", "toast", "arch", "pill", "drop", "peanut", "puff", "mushroom", "bear", "cat", "mouse", "bunny", "frog", "imp", "bot", "ghost", "sprout"] as const;
export type Shape = (typeof shapes)[number];
export const colors = {
  black: "#343539",
  brown: "#d09b71",
  red: "#ff9cac",
  orange: "#ffa27c",
  amber: "#fed25f",
  green: "#afe97d",
  teal: "#71e2ca",
  blue: "#79c8fa",
  purple: "#a7b1fa",
  pink: "#eba1e0",
  gray: "#a9b2be",
} as const;
export type Color = keyof typeof colors;
export const moods = ["bright", "happy", "calm", "focus", "doubt", "wow", "shy", "wink"] as const;
export type Mood = (typeof moods)[number];
export const heads = ["none", "headphones", "beanie", "cap", "beret", "headband", "swoop"] as const;
export type Head = (typeof heads)[number];
export const faces = ["none", "glasses", "shades", "mustache"] as const;
export type Face = (typeof faces)[number];
export const outfits = ["none", "blazer", "turtleneck", "hoodie", "scarf", "bowtie", "badge"] as const;
export type Outfit = (typeof outfits)[number];
// What it wears takes a deep shade of the bot's own color, or black, or white.
export const tints = ["own", "black", "white"] as const;
export type Tint = (typeof tints)[number];

// `provider` is a provider id, or empty for none. An empty model follows the provider's default model.
export type Fields = { name: string; instructions: string; model: string; provider: string; shape: Shape; color: Color; mood: Mood; head: Head; face: Face; outfit: Outfit; tint: Tint };
// `preview` is the start of the latest reply, for a list of bots. `handoff` is the summary a provider switch carried
// over, which the current chat starts from. `busy` is true while a turn runs, and `waiting` while a plugin holds one of its calls. Pinned bots head the list.
export type Profile = Fields & { id: string; sessionId: string | null; preview: string | null; handoff: string | null; busy: boolean; waiting: boolean; pinned: boolean; isDefault: boolean };
// An update takes any field, and `pinned`. The first bot starts pinned, and at most `maxPinned` are.
export type ProfileUpdate = Partial<Fields> & { pinned?: boolean };
export const maxPinned = 3;
// New bots start on `defaultProvider`. Memory search's vectors come from `embedder`: the machine's local embedder, a
// provider's /embeddings (`embeddingProvider` and `embeddingModel`), or none. `messageVectors` is how many characters of
// each message are embedded, and 0 embeds none.
export type Embedder = "local" | "remote" | "off";
// `unvetted` shows plugins fxbot doesn't vet: the public registries, and adding by address or repository.
// `defaultProfile` is the bot whose chat a launch at / opens, or "" for none. `turnsAtOnce` is how many turns run at
// once, read when fxbot starts. `onboarded` says first-run setup is finished or skipped, and `onboardingStep` is where it's up to.
export type Settings = { defaultProvider: string; defaultProfile: string; unvetted: boolean; timeZone: string; turnsAtOnce: number; onboarded: boolean; onboardingStep: string; embedder: Embedder; embeddingProvider: string; embeddingModel: string; messageVectors: number };
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
  /** The plugins running now that wouldn't on `latest`. */
  wontRun: string[];
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
export type LibraryQuery = { q?: string; profileId?: string; sessionId?: string; kind?: ItemKind; before?: string; limit?: number };
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

// A plugin gives bots more to use: a remote MCP server, or a skill. `bots` is "all", or "each" for only the bots in
// `on`. `status` says what it waits for, if anything. A mark is what the hourly check found.
// `iconKey` is who made it and its name, `creator/name`, which a page draws with `pluginIcon` (plugin-icon.ts).
type PluginCommon = { id: string; name: string; iconKey: string; enabled: boolean; bots: "all" | "each"; on: string[]; status: string; mark?: PluginMark };
// A remote MCP server. `auth` is how it signs in: not at all, with headers whose values fxbot keeps sealed, or with
// OAuth. `signedIn` says it has its token or header values. Bots get only the tools in `allowed`, which are the
// read-only ones until the person picks. Its `status` says "Connected" once it is.
export type McpTool = { name: string; description: string; readOnly: boolean };
export type Transport = "streamable-http" | "sse";
export type McpPlugin = PluginCommon & {
  kind: "mcp";
  url: string;
  transport: Transport;
  auth: "none" | "headers" | "oauth";
  headers: string[];
  allowLocal: boolean;
  allowed: string[];
  tools: McpTool[];
  signedIn: boolean;
  ownClient: boolean;
  /** The registry entry it was added from, its version then, and where it came from. */
  source?: { registry: string; version: string; from: RegistryFrom };
  /** What its source says about it now. */
  info?: RegistryInfo;
};
// A skill, installed as skills.sh installs it: `<owner>/<repo>/<skillId>`, from the repository at `commit`, found in
// fxbot's own list or on skills.sh.
export type SkillSource = { skill: string; commit: string; from: "fxbot" | "skills.sh" };
// A file of a skill: its path in the skill's folder, its size, and a hash of it, to show what an update changes.
export type SkillFile = { path: string; size: number; hash: string };
// A skill as installed. `manual` is one only a person calls by name, which bots don't see in their list.
export type SkillPlugin = PluginCommon & { kind: "skill"; source: SkillSource; description: string; files: SkillFile[]; license?: string; manual?: boolean };
// A plugin: code that changes fxbot itself, from a GitHub repository's folder at a pinned commit, or in a checkout from
// a folder of FXBOT_PLUGIN_DIRS. `parts` is what it registered when it loaded; `error` is why it is off.
export type PackageSource = { local: string } | { repo: string; path: string; commit: string; from: "fxbot" | "github" };
export type PluginSetting = { name: string; description: string; default?: string; isRequired?: boolean; isSecret?: boolean };
export type PackageParts = { tools: string[]; hooks: string[]; routes: string[]; sockets: string[]; page: boolean };
export type PackagePlugin = PluginCommon & {
  kind: "package";
  source: PackageSource;
  version: string;
  description: string;
  /** Its files when it was added or updated, to show what an update changes. A local plugin's aren't kept. */
  files: SkillFile[];
  /** The MCP servers it added, which follow its switch and its bots, and go when it does. */
  servers: string[];
  /** Whether it runs code inside fxbot: a server module or page code. */
  code: boolean;
  /** The skills it carries, while it runs. */
  skills: string[];
  /** The plugins it needs, which load before it and can't be removed while it's added. */
  needs: string[];
  /** Its settings, with each value but a secret's, which says only whether it is set. */
  settings: (PluginSetting & { value?: string; set: boolean })[];
  parts: PackageParts;
  error?: string;
  /** Why it doesn't run on this fxbot. Its files, settings, and tables stay. */
  unsupported?: string;
};
export type Plugin = McpPlugin | SkillPlugin | PackagePlugin;
// A plugin by its GitHub repository and the folder it's in: `<owner>/<repo>`, or `<owner>/<repo>/<folder>`.
export type RepoRef = { repo: string; from?: "fxbot" | "github" };
// A plugin's page, from its repository's current commit: what it is, the files that run inside fxbot, and the rest of
// what it carries, with the text of each file the page can show. Add sends `hash` back, and fails if the plugin
// changed since. One that can't be added has an `error`. For an installed plugin, `changed` lists what an update
// changes.
export type PackagePreview = {
  hash: string;
  name: string;
  /** Its icon's key, once its plugin.json is read: the repository's owner and its name. */
  iconKey: string;
  version: string;
  description: string;
  /** Where its files are: a repository at a commit, or, for an installed local plugin, its folder. */
  source: PackageSource;
  files: SkillFile[];
  skipped: { path: string; why: string }[];
  /** The files that run inside fxbot: its server and page code. */
  code: string[];
  /** The text of plugin.json, its code, its CSS, and its migrations, by path. */
  texts: Record<string, string>;
  settings: PluginSetting[];
  migrations: string[];
  skills: string[];
  /** The plugins it needs, and whether each is added. Add waits for them. */
  needs: { name: string; added: boolean }[];
  /** Its MCP servers. Remote ones are added with it; one that runs a command isn't used yet. */
  servers: { name: string; url?: string; used: boolean }[];
  changed?: { path: string; change: "changed" | "added" | "removed" }[];
  error?: string;
  /** It can't run on this fxbot, which `error` says, and `needsFxbot` is the fxbot it needs, if a newer one would do. */
  unfit?: boolean;
  needsFxbot?: string;
};
// A plugin in fxbot's own list.
// `note` is what the owner should know before adding it, such as that it changes the machine.
export type PackageCard = { kind: "package"; name: string; iconKey: string; description: string; ref: string; from: "fxbot"; note?: string };
// `essentials` is the pack fxbot recommends, by name, in the order to add them, whatever the search matched.
export type PackageSearch = { cards: PackageCard[]; essentials: string[] };
// What the page loads for a running plugin: its page code and its CSS, by URL.
export type PluginPage = { name: string; iconKey: string; version: string; page?: string; css?: string };
// Where a registry entry comes from: fxbot's own list, GitHub's registry, or the official one, unmoderated.
export type RegistryFrom = "fxbot" | "github" | "official";
// What the page asks to add: a server by its URL, with the names of any headers it needs, or a registry entry, from
// GitHub's registry unless `from` says otherwise.
export type PluginRef =
  | { url: string; transport?: Transport; headers?: string[]; allowLocal?: boolean }
  | { registry: string; version?: string; allowLocal?: boolean; from?: RegistryFrom }
  | SkillRef
  | RepoRef;
// A skill by its skills.sh id, `<owner>/<repo>/<skillId>`, as found in fxbot's list or on skills.sh.
export type SkillRef = { skill: string; from?: SkillSource["from"] };
// The plugin page: what probing the server found, and for a registry entry, what the registry says about it. Add sends
// `hash` back, and fails if the server changed since. `local` is an entry that runs only on this machine, which can't
// be added before plugins.
export type McpPreview = Omit<McpPlugin, "id" | "kind" | "headers" | "enabled" | "bots" | "on" | "allowed" | "status" | "tools" | "signedIn" | "ownClient" | "source" | "mark"> & {
  hash: string;
  headers: { name: string; secret: boolean; description?: string }[];
  tools: McpTool[] | null;
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
export type RegistryInfo = {
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
  from: RegistryFrom;
};
// A search result. `url` and `host` are its remote's, and `hostMatches` whether it is on the namespace's domain, when
// the namespace names one. `needs` is "key" when the entry asks for a secret header; a sign-in is learned on its page.
// `local` runs only on this machine.
export type McpCard = RegistryInfo & { kind: "mcp"; iconKey: string; url?: string; host?: string; hostMatches?: boolean; needs?: "key"; local?: boolean };
// What the hourly check found about an installed plugin. It changes nothing by itself.
export type PluginMark = { kind: "update"; version: string } | { kind: "needs"; version: string } | { kind: "deprecated" } | { kind: "removed" };
// A search's cards, and the mirror's state: when it last synced, and why the last try failed.
export type McpSearch = { cards: McpCard[]; syncedAt: string | null; error?: string; everythingError?: string };
// A skill found in fxbot's list or on skills.sh. skills.sh gives installs but no description; fxbot's list gives one.
export type SkillCard = { kind: "skill"; id: string; name: string; iconKey: string; repository: string; from: SkillSource["from"]; description?: string; installs?: number };
export type SkillSearch = { cards: SkillCard[]; error?: string };
// A skill a bot has, as its chat's picker lists it: `$name` in a message, or `/name` at its start, sends it along.
// `command` is a plugin's command, which goes in the `/` list without being a skill.
export type BotSkill = { name: string; description: string; manual?: boolean; command?: true };
// Write-only: header values, or the person's own OAuth client for a server that registers none itself.
export type PluginSecrets = { headers?: Record<string, string>; clientId?: string; clientSecret?: string };
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
  /** On `user_message`, a message that joined a running turn: its words, and in `id`, its own messageId. */
  text?: string;
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
  /** On `moved`, the stream's last line: the session the chat started over in. */
  sessionId?: string;
};
