import type {
  Plugin,
  BotSkill,
  McpPreview,
  PluginRef,
  McpSearch,
  PluginSecrets,
  Fields,
  Kind,
  LibraryItem,
  LibraryPage,
  LibraryQuery,
  Message,
  Model,
  NewProvider,
  OAuthAttempt,
  OAuthStatus,
  PackagePlugin,
  PluginPage,
  PackagePreview,
  RepoRef,
  PackageSearch,
  Profile,
  ProfileUpdate,
  Provider,
  ProviderUpdate,
  Settings,
  SignIn,
  SignInStatus,
  SkillPreview,
  SkillRef,
  SkillSearch,
  StreamLine,
  Team,
  UpdateStatus,
  Upload,
  EmbeddingStatus,
  LocalEmbedder,
  Memory,
} from "./types.ts";

export type * from "./types.ts";
export { colors, embeddingKinds, faces, heads, itemKinds, kinds, maxPinned, moods, outfits, shapes, tints } from "./types.ts";
export { iconSeed, pluginIcon, type PluginIcon, type Tones } from "./plugin-icon.ts";

export const unreachable = "Cannot reach the server.";

export type ClientOptions = {
  /** The server's origin. Default: the page's own. */
  baseUrl?: string;
  /** Hears the version the server names on each answer, so a page can notice a new one. */
  onVersion?: (version: string) => void;
};

export type StreamOptions = {
  /** Where to start: 0 replays the whole chat. */
  cursor?: number;
  /** The session `cursor` is in. When the chat has moved from it, the stream is the moved line alone. */
  session?: string;
  /** Stops the stream. */
  signal?: AbortSignal;
  /** Hears the connection drop and come back. */
  onConnection?: (connected: boolean) => void;
  /** Hears each connection catch up: every line the chat had when it opened has been yielded. */
  onCaughtUp?: () => void;
};

// A typed client for an fxbot server's /api routes, for a page or a script. It carries no credentials: secrets stay
// with the server, which calls the SDK. Each call throws an Error with the server's message, or `unreachable`.
export function createClient({ baseUrl = "", onVersion }: ClientOptions = {}) {
  async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(unreachable);
    }
    const version = res.headers.get("x-fxbot-version");
    if (version) onVersion?.(version);
    // A body that is not JSON comes from a proxy in front of a stopped server.
    const data = await res.json().catch(() => null);
    if (!res.ok || data === null) throw new Error(data?.error ?? unreachable);
    return data;
  }

  // Every line of a bot's chat from `cursor` on, then each new one, until `signal` aborts. After a dropped
  // connection it asks again from the last cursor it read, every 2 seconds. A `moved` line, when the chat starts over,
  // is the last: a cursor of the old session means nothing in the new one.
  async function* stream(id: string, { cursor = 0, session, signal, onConnection, onCaughtUp }: StreamOptions = {}): AsyncGenerator<StreamLine> {
    let epoch = 0;
    while (!signal?.aborted) {
      try {
        const res = await fetch(`${baseUrl}/api/profiles/${id}/stream?${new URLSearchParams({ cursor: String(cursor), ...(session ? { session } : {}) })}`, { signal });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const version = res.headers.get("x-fxbot-version");
        if (version) onVersion?.(version);
        onConnection?.(true);
        // The chat's newest line when the server opened the stream. A server without the header is caught up at once.
        const end = Number(res.headers.get("x-fxbot-end") ?? 0);
        let behind = true;
        const caughtUp = () => {
          if (!behind || cursor < end) return;
          behind = false;
          onCaughtUp?.();
        };
        caughtUp();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let rest = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parts = (rest + value).split("\n");
          rest = parts.pop()!;
          for (const part of parts.filter(Boolean)) {
            const line: StreamLine = JSON.parse(part);
            cursor = line.cursor ?? cursor;
            // libfx's rule: hide a line whose epoch is lower than one before it.
            if (line.epoch !== undefined && line.epoch < epoch) {
              caughtUp();
              continue;
            }
            epoch = line.epoch ?? epoch;
            yield line;
            if (line.type === "moved") return;
            caughtUp();
          }
        }
      } catch {}
      if (signal?.aborted) return;
      onConnection?.(false);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return {
    health: () => call<{ ok: true; version: string }>("/health"),
    // The running version and the newest release. `start` updates to that release, where Settings can.
    update: {
      get: () => call<UpdateStatus>("/update"),
      start: () => call<UpdateStatus>("/update", "POST"),
    },
    profiles: {
      list: () => call<Profile[]>("/profiles"),
      get: (id: string) => call<Profile>(`/profiles/${id}`),
      create: (fields: Partial<Fields> & { name: string }) => call<Profile>("/profiles", "POST", fields),
      update: (id: string, fields: ProfileUpdate) => call<Profile>(`/profiles/${id}`, "PATCH", fields),
      // Stops the turn running in the bot's chat.
      stop: (id: string) => call<{ ok: true }>(`/profiles/${id}/stop`, "POST"),
      remove: (id: string) => call<{ ok: true }>(`/profiles/${id}`, "DELETE"),
      // Finished turns from the bot's chats before its current one, oldest first.
      earlier: (id: string) => call<Turn[]>(`/profiles/${id}/earlier`),
      // The bot's skills, for the $ and / picker.
      skills: (id: string) => call<BotSkill[]>(`/profiles/${id}/skills`),
      // What the bot keeps: newest first, or the matches for a search.
      memories: {
        list: (id: string, query = "") => call<Memory[]>(`/profiles/${id}/memories${query.trim() ? `?query=${encodeURIComponent(query.trim())}` : ""}`),
        add: (id: string, text: string) => call<Memory>(`/profiles/${id}/memories`, "POST", { text }),
        update: (id: string, memoryId: string, text: string) => call<Memory>(`/profiles/${id}/memories/${memoryId}`, "PATCH", { text }),
        remove: (id: string, memoryId: string) => call<{ ok: true }>(`/profiles/${id}/memories/${memoryId}`, "DELETE"),
      },
    },
    settings: {
      get: () => call<Settings>("/settings"),
      // Any of the fields. `local` asks the machine to run its local embedder on the CPU or a GPU.
      update: (settings: Partial<Settings> & { local?: LocalEmbedder }) => call<Settings>("/settings", "PATCH", settings),
      // How far memory search's vectors have got.
      embedding: () => call<EmbeddingStatus>("/settings/embedding"),
    },
    // A key goes to the server once and never comes back: a listed provider says only whether it holds one.
    providers: {
      list: () => call<Provider[]>("/providers"),
      add: (provider: NewProvider) => call<Provider>("/providers", "POST", provider),
      update: (id: string, fields: ProviderUpdate) => call<Provider>(`/providers/${id}`, "PATCH", fields),
      remove: (id: string) => call<{ ok: true }>(`/providers/${id}`, "DELETE"),
      models: (id: string) => call<Model[]>(`/providers/${id}/models`),
      teams: (id: string) => call<Team[]>(`/providers/${id}/teams`),
    },
    // A device code sign-in: show the code and link, then poll until it is done or failed.
    signIns: {
      start: (kind: Kind, provider?: string) => call<SignIn>("/sign-ins", "POST", { kind, provider }),
      get: (id: string) => call<SignInStatus>(`/sign-ins/${id}`),
      cancel: (id: string) => call<{ ok: true }>(`/sign-ins/${id}`, "DELETE"),
    },
    // Every bot's files, newest saved first. A file itself is read through the item's `url`.
    library: {
      list: ({ q, profileId, kind, before, limit }: LibraryQuery = {}) => {
        const params = new URLSearchParams(Object.entries({ q, profile: profileId, kind, before, limit }).flatMap(([key, value]) => (value === undefined || value === "" ? [] : [[key, String(value)]])));
        return call<LibraryPage>(`/library${params.size ? `?${params}` : ""}`);
      },
      get: (id: string) => call<LibraryItem>(`/library/${id}`),
      remove: (id: string) => call<{ ok: true }>(`/library/${id}`, "DELETE"),
    },
    // Plugins: MCP servers, skills, and packages. Preview one, then add it with the preview's hash. Header values and an OAuth
    // client go to the server once and never come back.
    plugins: {
      list: () => call<Plugin[]>("/plugins"),
      preview: <R extends PluginRef>(ref: R) => call<R extends SkillRef ? SkillPreview : R extends RepoRef ? PackagePreview : McpPreview>("/plugins/preview", "POST", { ref }),
      add: (ref: PluginRef, hash: string) => call<Plugin>("/plugins", "POST", { ref, hash }),
      // The registry's entries; `everything` also asks the official registry, unmoderated.
      search: (q: string, { kind, everything }: { kind?: string; everything?: boolean } = {}) =>
        call<McpSearch>(`/plugins/search?${new URLSearchParams({ q, ...(kind ? { kind } : {}), ...(everything ? { everything: "1" } : {}) })}`),
      // fxbot's skills list, then skills.sh's results for 2 characters or more.
      searchSkills: (q: string) => call<SkillSearch>(`/plugins/search?${new URLSearchParams({ q, kind: "skill" })}`),
      // fxbot's plugins list.
      searchPackages: (q: string) => call<PackageSearch>(`/plugins/search?${new URLSearchParams({ q, kind: "package" })}`),
      // One of an installed skill's files; SKILL.md by default.
      readSkill: (id: string, file?: string) => call<{ text: string }>(`/plugins/${id}/skills?${new URLSearchParams(file ? { file } : {})}`).then((r) => r.text),
      // Moves a plugin to the newer definition its page showed, with that page's hash.
      update: (id: string, hash: string) => call<Plugin>(`/plugins/${id}/update`, "POST", { hash }),
      change: (id: string, fields: { enabled?: boolean; bots?: "all" | "each"; allowed?: string[] }) => call<Plugin>(`/plugins/${id}`, "PATCH", fields),
      remove: (id: string) => call<{ ok: true }>(`/plugins/${id}`, "DELETE"),
      setSecrets: (id: string, secrets: PluginSecrets) => call<Plugin>(`/plugins/${id}/secrets`, "PUT", secrets),
      forBot: (profileId: string, pluginId: string, enabled: boolean) => call<Plugin>(`/profiles/${profileId}/plugins/${pluginId}`, "PUT", { enabled }),
      // Open `url`, then poll `oauth.get` until the status is done or failed.
      signIn: (id: string) => call<OAuthAttempt>(`/plugins/${id}/sign-in`, "POST"),
      // A plugin's settings: a value for each one named, or "" for its default. Secrets go in and never come back.
      configure: (id: string, settings: Record<string, string>) => call<PackagePlugin>(`/plugins/${id}/settings`, "PUT", settings),
      // A plugin's recent log lines and errors.
      log: (id: string) => call<{ lines: string[] }>(`/plugins/${id}/log`).then((r) => r.lines),
      // An installed package's page, from the files it runs, as Browse shows one before Add.
      contents: (id: string) => call<PackagePreview>(`/plugins/${id}/contents`),
      // The running packages' page code and CSS, for the page to load.
      pages: () => call<PluginPage[]>("/plugins/pages"),
    },
    oauth: {
      get: (id: string) => call<OAuthStatus>(`/oauth/attempts/${id}`),
      paste: (id: string, address: string) => call<OAuthStatus>(`/oauth/attempts/${id}/paste`, "POST", { address }),
    },
    // Resolves once the server has stored the message; the reply arrives on the stream.
    // `handled` says a plugin took the message, and no turn runs.
    send: (id: string, message: Message) => call<{ messageId: string; sessionId: string; handled?: true }>(`/profiles/${id}/messages`, "POST", message),
    stream,
  };
}

export type Client = ReturnType<typeof createClient>;

// A step of a reply, in the order it happened: thinking, text, or a tool call. A tool call has its input when it
// starts, or a preview of an input over 64 KiB, and its result when it ends.
export type Part =
  | { type: "user"; id?: string; text: string; files?: Upload[]; from?: string }
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; input?: unknown; inputPreview?: string; output?: string; error?: boolean; done: boolean };

// One message and its reply. `parts` is the reply step by step; `reply` is its text alone, the parts' text joined, and
// all a turn from an earlier chat has. `unsent` marks a message the server never took, which can be sent again.
// `from` names the plugin that sent the message, when one did. `handled` is for a page: a plugin took the message.
export type Turn = { messageId: string; text: string; files?: Upload[]; reply: string; parts?: Part[]; done: boolean; note?: string; unsent?: boolean; from?: string; handled?: true };

// Folds one stream line into a thread. Lines without a messageId, such as `idle`, change nothing.
export function applyLine(turns: Turn[], line: StreamLine): Turn[] {
  const { messageId } = line;
  if (!messageId) return turns;
  const i = turns.findLastIndex((turn) => turn.messageId === messageId);
  const turn = turns[i] ?? { messageId, text: "", reply: "", done: false };
  if (line.type === "turn_start" || line.type === "turn_resume") {
    // Turns show in the order they start, so a message sent during the replay lands after it.
    // A turn that runs again after a crash sends its reply again from the start.
    const started = {
      ...turn,
      text: typeof line.input === "string" ? line.input : turn.text,
      files: line.files ?? turn.files,
      ...(line.from ? { from: line.from } : {}),
      reply: "",
      parts: [],
      done: false,
      note: undefined,
      unsent: undefined,
    };
    return [...(i < 0 ? turns : turns.toSpliced(i, 1)), started];
  }
  const parts = turn.parts ?? [];
  // A message that joined this turn shows in place among its steps, and the page's own copy of it goes.
  if (line.type === "user_message") {
    if (parts.some((p) => p.type === "user" && p.id === line.id)) return turns;
    const part: Part = { type: "user", id: line.id, text: line.text ?? "", ...(line.files?.length ? { files: line.files } : {}), ...(line.from ? { from: line.from } : {}) };
    const placed = i < 0 ? [...turns, { ...turn, parts: [part] }] : turns.with(i, { ...turn, parts: [...parts, part] });
    return line.id ? placed.filter((t) => t.messageId !== line.id) : placed;
  }
  const last = parts.at(-1);
  // Deltas of one kind in a row make one part; a tool call or the other kind starts the next.
  const add = (type: "text" | "reasoning", delta: string): Part[] =>
    last?.type === type ? parts.with(-1, { type, text: last.text + delta }) : [...parts, { type, text: delta }];
  let next: Turn;
  if (line.type === "text_delta" && line.delta) {
    next = { ...turn, reply: turn.reply + (last?.type === "text" || !turn.reply ? "" : "\n\n") + line.delta, parts: add("text", line.delta) };
  } else if (line.type === "reasoning_delta" && line.delta) {
    next = { ...turn, parts: add("reasoning", line.delta) };
  } else if (line.type === "tool_start" && line.id) {
    const call: Part = { type: "tool", id: line.id, name: line.name ?? "tool", input: line.input, inputPreview: line.inputPreview, done: false };
    next = { ...turn, parts: [...parts.filter((p) => !(p.type === "tool" && p.id === line.id)), call] };
  } else if (line.type === "tool_end" && line.id) {
    // A call that started before the replay's cursor ends without its start, so it is added here.
    const at = parts.findIndex((p) => p.type === "tool" && p.id === line.id);
    const ended = { output: line.content, error: line.isError === true, done: true };
    next = { ...turn, parts: at < 0 ? [...parts, { type: "tool", id: line.id, name: line.name ?? "tool", ...ended }] : parts.with(at, { ...(parts[at] as Part & { type: "tool" }), ...ended }) };
  } else if (line.type === "turn_end") {
    const note = line.error ? `Error: ${line.error.message}` : line.stopReason === "end_turn" ? undefined : `Stopped: ${line.stopReason}`;
    // A turn that ends with a tool still running, as on an error, leaves the tool ended too.
    next = { ...turn, done: true, note, parts: parts.map((p) => (p.type === "tool" && !p.done ? { ...p, done: true } : p)) };
  } else return turns;
  return i < 0 ? [...turns, next] : turns.with(i, next);
}
