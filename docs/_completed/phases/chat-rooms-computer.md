# A computer for each room

`chat-rooms-computer` gives a chat room a computer of its own. The room's bots share that one machine, taking turns: one desktop, one terminal, one browser, and one home. The owner watches it on the computer's screen, where each bot's last cursor is drawn with its name. Each bot learns where the others last pointed from its own tool results.

Status: planned on 2026-11-04, for 0.5.0, at the owner's word; researched against the research directive's references. It is a plugin of its own, which needs the [computer](../_completed/phases/computer.md) and [chat rooms](../_completed/phases/chat-rooms.md). The owner made two decisions:
1. **The room's bots take turns** on the room's computer. Room turns stay one bot at a time, as chat-rooms runs them now. They never run in parallel.
2. **The owner's view is enough** for cursors. The owner sees every bot's cursor drawn over the live desktop, and the bots learn the others' positions as text. Nothing is drawn into X or into the bots' screenshots.

## 0. Core or plugin

**A plugin**, `chat-rooms-computer`, which needs `computer` and `chat-rooms` ([Core or plugin](../../CONVENTIONS.md#core-or-plugin)). A room is a plugin's, and so is a computer. The new plugin also changes those two plugins: the computer learns to name a computer by a key instead of a bot, and chat rooms tells other plugins which room a session is for.

The plugin API gains two small pieces, because plugins can't use each other today. Core owns these, as "what plugins plug into":
- **On the server: `fx.provide(api)` and `fx.need(name)`.** A plugin offers an object, and a plugin that names it under `needs` gets it. Each entry of `fx.dependents()` also gains `api`, so a plugin can ask the plugins that need it. The [computer](../_completed/phases/computer.md#0-core-or-plugin) phase named `fx.need("computer")` and left it "for the first plugin that needs it". This is that plugin.
- **On the page: `app.slot(name, Component)` and `@fxbot/app`'s `Slot`.** One plugin's page leaves a named place, and another plugin fills it. Without one, a room's screen can't show the room's computer.

Ways around them, and why not:
- **Reading chat-rooms' tables** from the new plugin's SQL breaks "a plugin's data lives in its own tables".
- **A `tool.before` hook that adds a computer to each call's input** would let a model name any computer itself.
- **Reading the room from chat-rooms' line in a bot's instructions** breaks when that line changes.
- **Telling the computer each session's computer ahead of time** is lost whenever either plugin reloads.

## 1. Research

Checked on 2026-11-04. fxbot's code was read at `31a830d` on `release/0.5.0`. The references were read from shallow clones made that day, at the commits named, and none of their code was run. Three background reads covered the CopilotKit projects, eve, fx, Pi, fx0, and durable-harness, and the web. Their quotes used here were checked against the clones or fetched again, except where marked.

### fxbot today

`S` is `plugins/computer/fxbot/server.ts` (computer 0.2.2), and `R` is `plugins/chat-rooms/fxbot/server.ts` (chat-rooms 0.2.0).

**A computer is a bot's.**
- Its container is `fxbot-computer-<bot>`, with a volume of the same name at `/root`, labelled `fxbot.computer=<bot>` and `fxbot.install` (S:350, S:435-443).
- Its hostname is the bot's name and `-computer` (`hostOf`, S:69-72). It comes from `fx.bots.get(bot)` at each start, and a rename makes the computer again (S:424-433).
- Every tool calls `ready(bot)` with the call's bot alone (S:481-485, S:506), though each call also has its `session` (`packages/sdk/src/plugins.ts:591`).
- The idle sweep calls `forget()`, which removes every computer whose key isn't a bot that exists (S:380-403). So, as things stand, it would delete any other computer.
- The sockets refuse anything but a bot that exists, and the per-bot routes anything but a bot's id, 12 hex characters (S:68, S:817, S:929-957).
- The hook that copies a skill's files when a bot reads it sends them to the bot's own computer, and clears the note (S:459-479).

**The desktop.**
- The computer's command, `session`, starts:
  - a D-Bus session
  - Xvnc on `:1`, on a unix socket with no TCP port
  - the accessibility bus
  - the tmux session `main`
  - XFCE, whose autostart opens a terminal window on `main` (`plugins/computer/fxbot/session:12-19`, S:62-66)
- The owner watches through the socket `/desktop/:bot`, which runs `socat` to Xvnc's socket (S:855). The page uses noVNC, view-only, scaled to fit (`page.jsx:84-88`). The screen polls the computer's state every 3 s (`page.jsx:161`).
- **Take over** and **Hand back** set an `owner` map by bot (S:948-955). It pauses `computer_desktop` and `computer_terminal` only (S:626-627, S:654, S:734).
- When the owner hands back after `computer_ask_owner`, a message goes to the bot's own chat (S:629-633). In a room, that would start a turn in the wrong session, on the wrong computer.
- **`computer_desktop`** runs one `fxbot-screen` exec: xdotool acts, then `scrot -o` takes the screen. Its result text ends with `Cursor (x, y)` (S:740-747). `scrot` runs without `--pointer`, so no pointer is drawn into the screenshot (`fxbot-screen`).
- **agent-browser** drives the desktop's Chromium over CDP on port 9222. The wrapper raises Chromium's window with xdotool before each call, and passes no `--session` (`plugins/computer/fxbot/agent-browser:11-19`).
- **agent-desktop** works over AT-SPI, and over XTEST for pointer commands.

**Concurrency.**
- Nothing in the computer serializes calls. Two at once interleave their xdotool and tmux commands.
- The take-over check runs only at a call's start, so a call already running finishes after **Take over**.
- Within one turn, libfx runs a tool that isn't idempotent alone: "calls to idempotent tools from one model response run at the same time, up to 16 at once. A tool that isn't idempotent runs alone, and so does one marked `writes: true`" (`node_modules/libfx/README.md:273`, libfx 0.0.16). `computer_shell`, `computer_terminal`, and `computer_desktop` set `idempotent: false` (S:501, S:652, S:732). This comes from libfx's README and fx's source (below), not from a trace through fxbot.

**Chat rooms.**
- Each bot's room turn runs in a plugin session of its own, made with `fx.chats.newSession` (R:120-133). `roomOf` maps a session to its room, in memory, loaded from the `sessions` table at start (R:56, R:60).
- A room's queue runs one turn at a time (`drain`, R:238-255). Different rooms run at once.
- Room ids are `serial` (`plugins/chat-rooms/fxbot/migrations/0001_rooms.sql`). Deleting a room cascades to its sessions, but not to `roomOf` in memory (R:309-313).
- The room's header is the app's `Header`, with the bots' avatars and **Edit** (`plugins/chat-rooms/fxbot/page.jsx:355-370`).
- A room sends `$chat-room` with a bot's first turn there (R:148). The core reads `$name` after the `message` hooks run (`packages/sdk/src/index.ts:389-397`), so a hook can add a skill to a message.

**The plugin API.**
- Plugins can't call each other: `PluginApi` has no such call (`packages/sdk/src/plugin-api.ts`).
- `fx.dependents()` gives `{ name, version, needs }` for every added plugin that needs this one, running or not (`plugins.ts:222-225`).
- Plugins load after the plugins they need (`plugins.ts:644-655`). One can't be removed while another needs it (`plugins.ts:770-771`). Removing one drops its schema (`plugins.ts:776`).
- The `instructions` hook runs at every session open, with the session (`index.ts:243-247`). Hooks and tools reach only the bots a plugin is on for (`plugins.ts:215`).
- On the page, a plugin's places are its routes, a sidebar group, nav, composer controls, tool views, Settings and bot settings sections, and the bot panel (`packages/ui/src/plugins.tsx:35-44, 111-122`). `Place` draws every plugin's parts for one place, each in an error boundary (`plugins.tsx:169-178`). Nothing lets a plugin add to another plugin's screen.

**noVNC**, as the computer bundles it (`plugins/computer/fxbot/novnc.js`):
- It scales the screen to fit with its aspect ratio kept (`autoscale`, novnc.js:674-684), and centres it: a flex box with the canvas at `margin: auto` (novnc.js:8974-8980). So a position on the computer's screen maps to the page by one scale and one offset.
- It asks for the cursor pseudo-encodings (novnc.js:10308-10311). That means it draws the server's cursor shape under the viewer's own mouse. RFB has no notion of a second cursor.

### The references

**agent-browser** (`vercel-labs/agent-browser`, 0.41.2, `6682da3`; fxbot installs 0.41.1):
- **Sessions:** "Each session has its own: Browser instance, Cookies and storage, Navigation history, Authentication state" (`docs/content/docs/sessions.mdx:35-40`).
- **Sharing one Chrome:** "When sessions instead share one Chrome over `--cdp`, only the tab selection separates them. Each session remembers which tab it is bound to" (`sessions.mdx:44`).
- **Pinning:** `--pin-tab` makes the binding strict: "Two agents sharing one Chrome, each pinned to its own tab", and "Tabs opened by other sessions or the user never steal the pinned session's active tab" (`docs/content/docs/cdp-mode.mdx:84-95`). It came in 0.34.0, for "parallel sessions sharing one Chrome hijacking each other's tabs" (`CHANGELOG.md:416, 424`), so 0.41.1 has it.
- **Coming to the front:** a session's tab comes to the front only on an explicit switch. `tab <ref>` sends `Page.bringToFront` (`cli/src/native/browser.rs:2022-2026`), and so does a fresh tab for auto-connect (`cli/src/native/actions.rs:3750-3760`). Acting in a pinned tab doesn't raise it.
- **Labels:** "Tabs can be created with a memorable label via `tab new --label <name> [<url>]`, and labels are interchangeable with `t<N>` ids everywhere a tab ref is accepted" (`CHANGELOG.md:730`, well before 0.34; parsing at `cli/src/commands.rs:1671-1718`).
- **What its skill tells agents:** "Always use your own session". It also says: "The default unnamed session is one browser shared with every other agent on the machine… Working in it can take over another agent's page" (`skill-data/core/SKILL.md:11-21`). The name it tells them to make, `session id --scope worktree`, comes from the git root or the working folder (`cli/src/main.rs:716-723`). Every exec on a computer starts in `/root`, so every bot there gets the same name.
- **Clicks:** clicks go through CDP's `Input.dispatchMouseEvent` (`cli/src/native/interaction.rs:137`). That reaches the page without moving X's pointer (inferred from how CDP input works).

**agent-desktop** (`vercel-labs/agent-desktop`, 1.1.0, `53e072d`, the version fxbot installs):
- **Headless by default:** "Actions are headless by default: no pointer movement, no focus change. Pass `--headed` for physical input" (`README.md:66`).
- **Several agents on one desktop:** "`session start --cursor --multi-agent` enables a cursor per `(session-id, agent-id)` (macOS, Windows, and Linux X11)… The interaction lease still serializes physical input on the shared OS pointer. A headless action moves its cursor before it takes the lease, so several agents' cursors travel at the same time while their actions take turns" (`CONCEPTS.md:233`). Multi-agent cursors came in 0.8.5 (`CHANGELOG.md:175`). 1.1.0 starts "a headless action's cursor travel before it takes the interaction lease, so the cursors of parallel agents move at the same time" (`CHANGELOG.md:20`).
- **The lease:** it is a file lock on `/tmp/agent-desktop-<uid>/interaction.lock` (`crates/core/src/session/interaction_lease.rs:108-135`).
- **The overlay:** "presentation-only… It never moves or replaces the OS pointer" (`CONCEPTS.md:231`). On Linux it is a shaped X11 window (`crates/linux/src/system/overlay/cursor_overlay.rs:1-4`), so it is drawn into X. agent-desktop hides it from its own screenshots (`cursor_overlay_capture.rs`), but `scrot` and the VNC view would show it. It also moves only for agent-desktop's own actions.
- **Snapshots:** "A ref from a session needs that session's `--session` flag or `AGENT_DESKTOP_SESSION` value" (`docs/faq.md:43`).

**fx and libfx** (`vercel-labs/fx`, `5245be4`):
- **Writes as a fence:** "A tool that writes is a fence: earlier calls finish before it starts, and later calls wait for it. A tool that does not say writes unless it is idempotent" (`src/core/tooling/host_tool_runtime.zig:94-101`). This is the rule behind libfx's README line above.
- **Locks:** none on a workspace that several sessions or subagents share. There is a session lease, and a lock for refreshing credentials.

**eve** (`vercel/eve`, `3b69045`):
- **One sandbox per session:** "Returns the sandbox for `ctx.session.id`… An idempotent upsert" (`packages/eve/src/sandbox/provider.ts:148-150`). "Built-in environments don't share sandboxes across sessions" (`docs/sandbox/index.mdx:132`).
- **What is shared:** a parent shares its sandbox with its subagents, and parallel copies are kept apart by prompt: "give parallel copies separate files to write".
- **The browser:** "each sandbox uses the `eve-default` browser session. Set `session` when multiple mounts need independent browser sessions inside one sandbox" (`packages/eve-agent-browser/README.md:82`).
- **No lock** on sandbox commands. Extensions use each other only by importing each other's packages.

**Pi** (`earendil-works/pi`, `04f672a`):
- **Pi 1.0:** its extensions talk through `pi.events`, a "Shared event bus for communication between extensions" (`packages/coding-agent/docs/extensions.md:1965-1972`). It is fire-and-forget, with no way to reach another extension's API. Extensions draw only in places the host owns: widgets, header, footer, and editor.
- **p2 and Chord**, its newer design, have the shape this plan needs:
  - "Plugins talk to each other only through object contracts and registries" (`packages/chord/docs/plugin-authoring.md:11-12`).
  - A dependent reaches another plugin's object: `self.get(Notes, { project }) // a dependency: Stats waits until Notes is live` (`:57`).
  - Slots: "`<Slot name>` renders one… `<SlotList prefix>` renders every `prefix:*` key" (`apps/p2/docs/plugin-hooks.md:223-224`). The envs plugin leaves `<SlotList prefix="envs-actions" />` (`apps/p2/plugins/envs/EnvsPanel.tsx:532`), and the ports plugin fills it: `self.contribute(Slots, { "envs-actions:ports": PortsButton, … })` (`apps/p2/plugins/ports/web.tsx:20`).

**OpenBot** (`CopilotKit/openbot`, `c40def5`): the closest product, and it chose to keep bots apart on one computer.
- **One computer per person:** a computer "now belongs to a person, and every Bot that person uses runs on it, each with its own browser profile and folder inside". Also: "THE BOTS ON A PERSON'S COMPUTER ARE NOT KEPT FROM EACH OTHER" (`server/src/computer/computer-key.ts:1-26`). The key is a union, `{ kind: "person"; personId } | { kind: "bot"; botId }` (`:34-36`).
- **No lock between bots.** Each bot gets a "seat" with its own Chromium, and the bots act at once.
- **Taking control:** the only gate is a barrier per seat for a person taking control: "Synchronous admission, asynchronous draining. No work is queued or replayed" (`agent-computer/src/action-barrier.ts:1`).
  - While a person holds it, "every acting call from the Bot is refused rather than queued, because a queued click arrives after the person has moved on" (`server/src/computer/schema.ts:292-295`).
  - After a hand-back, it sets `resumeSnapshotRequired` (`agent-computer/src/control.ts:469`).
- **Group channels** have no computer of their own. Each bot uses the turn owner's computer from its own seat. Bots answer "One Bot after another, so each later Bot reads what the earlier ones said" (`server/src/channels/group.ts:1236`). A bot that asked for help is marked `waiting`, and the group goes on (`group.ts:932-937`).
- **No agent cursors.** The view has only a name badge: "Whose screen this is, drawn as a small badge over the frame" (`app/src/components/computer/computer-view.tsx:287`).

**openmuse** (`CopilotKit/openmuse`, `a4944f4`): one agent per owner.
- A lease serializes each computer's actions, and refuses rather than waits: "Computer is busy. Wait for the current operation to finish." (`apps/server/src/computer.ts:270`).
- A finding that bears on any shared desktop: "A VNC viewer that loses focus mid-shortcut… leaves that modifier held, and every later click, key and wheel event then becomes a shortcut. Input actions release all modifiers first" (`apps/server/src/computer-e2b-desktop.ts:316-320`).

**OpenDuet** (`f52288f`) is an older vendored OpenBot with one computer per bot. **OpenDots** (`d4214af`) runs OpenBot's image with one computer per Dot. Neither has anything more.

**Grok Bot** (docs only; fetched 2026-11-04):
- **One computer, one screen per bot:** "Every Bot on your account uses the same computer", and "Each Bot gets its own screen on the shared computer. Several Bots can therefore use browser and desktop tools in parallel… The screens are separate work surfaces, not separate security boundaries" ([computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)).
- **Shared bots:** "In Slack channels, threads, group DMs, and group chats, a shared Bot uses one shared computer of its own" ([shared bots](https://docs.x.ai/grok-bot/shared-bots)).
- **Group chats:** "Ask for a single owner at each stage. Parallel handoffs create duplicate work and noisy updates."
- **Taking control:** "take control, complete only the blocked step, and tell the Bot to continue."

**fx0** (`eb33945`): subagents share one design, and the only guard is libfx's fence: "A tool that writes never runs beside another call" (`lib/libfx-agent.ts:164-166`).

**durable-harness** (`c7d2472`): one sandbox per session, and a VM refuses another: "this VM is armed for another session" (`packages/harness-sandbox/src/relay/relay.ts:500`).

### Others

Prior art beyond the directive's list, read through the web. The TigerVNC and Grok lines were fetched again. The rest came through one fetch tool and weren't checked by hand.
- **TigerVNC's own cursor.** Xvnc's `needRenderedCursor()` draws the real pointer into the picture once "the server's cursor position differs from the position of this client's last pointer event", after about a second (`common/rfb/VNCSConnectionST.cxx`). So the owner already sees X's one pointer move when a bot clicks. Only the labels, and the other bots' last positions, need drawing.
- **Several pointers in X.** `xinput create-master` makes a second pointer (MPX), and x11vnc's `-multiptr` gives "Each client… its own cursor and keyboard focus". But xdotool sends XTEST events to its client's pointer and has no option to pick another, from reading xserver's `Xext/xtest.c` (not tested). And `xinput` isn't in the image.
- **Multiplayer cursors:**
  - tldraw keeps `userName`, `color`, `cursor`, and `lastActivityTimestamp` per collaborator, in page coordinates. It hides a cursor after `collaboratorIdleTimeoutMs` (3 s) and `collaboratorInactiveTimeoutMs` (60 s).
  - Liveblocks throttles at 100 ms and drops presence "when the connection ends".
  - Yjs awareness marks a peer offline after 30 s.
  - Figma's `ActiveUser.position` is in canvas coordinates, and `color` "will match the color of their dot stamps and cursor".
  - All of them draw the cursors in the viewer's page, never in the document.
- **Several agents on one machine:**
  - Products give each agent a surface of its own: UFO2's picture-in-picture desktop, Windows' agent workspace in "a separate Windows session", Grok's screens, and OpenBot's seats.
  - Or they hand control to one party at a time: Magentic-UI "hands off control immediately upon user intervention", and CowPilot lets users "interleave their actions with the agent".
  - browser-use tried tab locking in one shared browser, then removed it for `--session` (PR #4514).
  - An open Codex issue (#20852) says "The shared desktop still has one foreground focus, one keyboard/mouse stream".
  - ClashBench (arXiv 2609.19892) measured "destructive preemption in 44.5% of trajectories" where agents shared mutually exclusive resources.
  - No system was found where several agents share one pointer by taking turns. fxbot's rooms already take turns between bots.

### What this research couldn't check

- **The real pointer in the owner's view.** Whether Xvnc draws it into the picture comes from TigerVNC's source, not from watching a computer. M3 checks it.
- **libfx's parallel rule** comes from its README and fx's source. It wasn't traced through fxbot's plugin tools.
- **Labelled tabs on a shared computer.** That `tab new --label` and `tab <label>` work the same whichever session a bot names was read from agent-browser's code and changelog, not run on 0.41.1 in a computer. M5 checks it.
- **The web lines marked above**, and the unverified MPX reading.

## 2. Key takeaways

1. **Turns are already enforced, so the computer needs no lock.**
   - A room runs one bot's turn at a time (R:238-255).
   - Within a turn, libfx runs `computer_shell`, `computer_terminal`, and `computer_desktop` alone.
   - Different rooms get different computers.
   - A lock in the plugin couldn't hold the owner's VNC input anyway. The take-over race is the one every computer has today, and this plan doesn't change it.
2. **Keys, not bots, and the dependent names the key at each call.** The computer asks its dependents "which computer for this bot and session?" on every call, as OpenBot's `ComputerKey` union and Pi's Chord `self.get` do. Asking each time means a reload of either plugin needs nothing registered again.
3. **The smallest plugin API is an object one plugin provides and another needs, plus a slot.** Pi's newer design reached the same shape: object contracts, and a slot one plugin leaves and another fills.
4. **One browser, with a tab for each bot by label, not a session for each bot.**
   - agent-browser's sessions and `--pin-tab` are for agents working at once.
   - A pinned tab doesn't come to the front when its session acts. The owner and `computer_desktop`'s screenshots would then see another bot's page.
   - A bot that opens its work with `tab new --label <name>` and returns with `tab <name>` brings its tab to the front, so the screen shows what it works on.
   - Sign-ins are the room's: one profile. Grok says even its separate screens are "not separate security boundaries", and this computer has one screen.
5. **One terminal, `main`, for everyone.** The owner's two views show one tmux window, so a window for each bot would hide the bots' typing. The skill says to read the terminal before typing, and to leave it at a prompt.
6. **Cursors are drawn by the page, over noVNC, as tldraw, Liveblocks, and Figma draw theirs.**
   - agent-desktop's multi-agent cursors draw into X, so they would show in every screenshot, and they follow only agent-desktop's own actions.
   - MPX needs `xinput`, and xdotool can't pick its pointer.
   - noVNC keeps the screen's aspect ratio and centres it, so the page maps a position with one scale and one offset.
   - The newest cursor is solid, and the others are faded rather than hidden. In a room that takes turns, an old position still says where that bot left off.
   - Cursors are kept in memory only, as presence is everywhere.
7. **Positions come from pixel actions.** agent-browser clicks through CDP, and agent-desktop is headless by default, so neither moves X's pointer. A bot that last used them shows as a label, such as "Ann · browser".
8. **Bots read the others' positions in `computer_desktop`'s results**, where coordinates matter, as one line of text.
9. **Look first.** Each turn on a shared computer starts from what another bot left. OpenBot forces a fresh snapshot after control changes hands, and agent-browser says "Re-snapshot after any page change". The skill and the one line in the instructions say to look before acting.
10. **Asking the owner for help in a room ends with the owner tagging the bot.** Hand back on a shared computer sends nothing, and `computer_ask_owner` says so. Grok does the same: "tell the Bot to continue". A room is where the owner already talks to its bots, so no message from the computer to the room is needed.
11. **An install without the new plugin runs nothing new.** The computer asks only dependents that provide an object, and the room's header slot stays empty.

## 3. Implementation

### What the owner sees

- The room's header gets a screen button, beside **Edit**. It opens a small dialog with a **Computer** switch.
  - Turned on, the room's bots use the room's computer in the room, instead of their own. The dialog then has **Open**.
  - Turned off, the room's computer stops and keeps its home. Removing the room removes both.
- **Open** goes to the computer's own screen, `/computer/computers/<key>`, with **Desktop**, **Terminal**, **Take over**, and **Hand back**, as for a bot.
  - Over the desktop, each bot that pointed at something has a small arrow in its colour, with its name and what it last did.
  - The newest is solid, and the others are faded.
- The same bots, in their own chats, keep their own computers.

### Files

```text
packages/sdk/src/plugin-api.ts            provide, need, Dependent.api
packages/sdk/src/plugins.ts               the three, in load() and dependentsOf
packages/ui/src/plugins.tsx               app.slot, and @fxbot/app's Slot
plugins/computer/                         0.3.0: keys, dependents' computers, cursors
plugins/chat-rooms/                       0.3.0: provide({ roomOf, rooms }), a Slot in the room's header
plugins/chat-rooms-computer/              0.1.0, new
├── README.md
├── plugin.json
├── package.json                          "type": "module", for the server code
├── fxbot/
│   ├── server.ts
│   ├── page.jsx
│   ├── page.js                           built
│   └── migrations/0001_computers.sql
└── skills/room-computer/SKILL.md
packages/sdk/src/plugins-registry.json    lists chat-rooms-computer
packages/website/src/content/docs/sdk/reference/plugin-api.md
packages/website/src/content/docs/docs/how-to/give-bots-a-computer.md
packages/website/src/content/docs/docs/reference/computer.md
packages/website/src/content/docs/docs/how-to/talk-in-a-room.md
CHANGELOG.md
```

### The plugin API (core)

`plugin-api.ts`:

```ts
// A plugin that needs this one, with what it asked of it, and what it provides: null while it isn't running.
export type Dependent = { name: string; version: string; needs: Record<string, unknown>; api: Record<string, unknown> | null };

export type PluginApi = {
  // …
  /** Offers an object to the plugins that need this one: they get it with fx.need, and this one reads theirs in
   * fx.dependents(). Since 0.5.0. */
  provide(api: Record<string, unknown>): void;
  /** What a plugin named under this one's needs provides, or null while it isn't running. Read it at each use:
   * an update or a reload replaces it. Since 0.5.0. */
  need<T = Record<string, unknown>>(name: string): T | null;
};
```

`plugins.ts`, in `load()`'s `api`, with `Loaded` gaining `api?: Record<string, unknown>`:

```ts
provide(offer) {
  if (!offer || typeof offer !== "object") throw new Error("provide takes an object.");
  loaded.api = offer;
},
need(name) {
  if (!record.config.needs?.[name]) throw new Error(`${record.name} doesn't name ${name} under needs.`);
  return (named(name)?.loaded?.api ?? null) as never;
},
```

`dependentsOf` adds `api: plugin.loaded?.api ?? null` to each entry. The object is the provider's own, not a copy. Its functions run the provider's code, with no time limit, and their errors reach the caller. A plugin that is turned off, failed, or unloading provides null.

`packages/ui/src/plugins.tsx`:
- `Places` gains `slots: Map<string, ComponentType<any>[]>`.
- `setup`'s `app` gains `slot: (name, Component) => …`, which appends to `places.slots`.
- `appModule` gains `Slot: ({ name, props }) => <Place pick={(places) => places.slots.get(name) ?? []} props={props ?? {}} />`.

Each part sits in its own error boundary, as every place's does, and a slot nobody fills draws nothing. Names are `<plugin that leaves it>.<place>`, such as `chat-rooms.room-header`.

### The computer 0.3.0

**Keys.** A computer is named by a key.
- A bot's key is its id, as today, so every existing computer and home stays as it is.
- Any other key comes from a dependent, and must match `/^[a-z]+-[a-z0-9-]{1,40}$/`. That has a dash, which a bot's id never has.
- The container and volume are `fxbot-computer-<key>`. A dependent's are also labelled `fxbot.by=<plugin>`.
- `last`, `busy`, `starting`, `owner`, `views`, and the new `marks` are kept by key. `noted`, the skills a bot read, stays by bot: their files go to whichever computer that bot's next call uses.

**Which computer a call uses.** The contract a dependent provides, written in the computer's README:

```ts
type ComputerProvider = {
  /** The computer for a chat, or null for the bot's own. `name` makes its hostname: `<name>-computer`. */
  computerFor(call: { bot: string; session: string }): Promise<{ key: string; name: string } | null>;
  /** Every computer it keeps, with its name; null while it can't tell. */
  computers(): Promise<{ key: string; name: string }[] | null>;
};
```

```ts
type Computer = { key: string; name?: string; by: string | null };
// The computer a call uses: the one a plugin that needs the computer names for its chat, such as a room's, or else
// the bot's own.
async function computerOf(bot: string, session: string): Promise<Computer> {
  for (const { name: by, api } of fx.dependents()) {
    const found = await (api as Partial<ComputerProvider> | null)?.computerFor?.({ bot, session });
    if (!found) continue;
    if (!isKey.test(found.key)) throw new Error(`${by} named a computer, ${found.key}, that isn't a key.`);
    return { key: found.key, name: found.name, by };
  }
  return { key: bot, by: null };
}
```

- `ready(bot, session)` calls `computerOf`, then `open(computer)`, then copies the bot's noted skills there. Every tool passes its call's `session`.
- `start(computer)` takes the hostname from `computer.name` for a dependent's computer, or from the bot's name as today. A renamed room makes its computer again on its next start, as a renamed bot does.
- The skill hook (S:469-479) copies at once only into the computer `computerOf(event.bot, event.session)` names, if it runs.

**Keeping and removing.** `forget()` keeps or removes each computer:
- **A bot's computer** goes when its bot is gone, as today.
- **A dependent's computer** goes when that plugin is no longer added, or when it runs and its `computers()` doesn't list the key.
- A dependent that is added but not running, or whose `computers()` answers null, keeps all of its own. That covers the computer's first sweep at start, before its dependents have loaded.
- **Stop**, **Reset**, and an idle stop clear the computer's marks.

**Who can be reached.** `known(key)` gives a bot's computer for a bot that exists, or a dependent's computer that its running dependent lists, with its name. Otherwise it gives null. The sockets and routes use it in place of `isBot`. The routes move from `bots/:id/…` to `computers/:key/…`: `state`, `start`, `stop`, `reset`, `takeover`, and the new `cursors`. The sockets keep their paths, `/desktop/:key` and `/terminal/:key`. Only the computer's page calls these, and it changes with them.

**The screen.**
- `app.route("/computers/:key", ComputerScreen)`. `/bots/:id` stays as the same screen, so old links work.
- The title is the state route's `name`: a bot's name, or the dependent's, such as "Design review's computer".
- Settings lists every computer, with each dependent's under its name.

**Take over and asking for help.**
- `owner` is kept by key and holds `{ reason?, bot? }`. While the owner has a shared computer, every bot's desktop and terminal calls on it wait.
- `handBack(key)` sends "Your owner handed the computer back…" only when the computer is the asking bot's own (`was.bot === key`). On a shared computer it sends nothing.
- `computer_ask_owner` on a shared computer answers: "Asked. Tell the owner in one line what you need, then end your turn. When it's done, they'll tell you to go on."
- The screen says "{bot} asked you: {reason}. Hand it back when you're done, then tell {bot} to go on."

**Cursors.**

```ts
// Where each bot last pointed on each computer, and what it did last, by key then bot. In memory only.
type Mark = { x?: number; y?: number; what: string; at: number };
const marks = new Map<string, Map<string, Mark>>();
```

- **`computer_desktop`:**
  - After a click, `mouse_move`, `left_click_drag`, or `scroll`, it records `info.cursor` and the action.
  - After `type` and `key`, it records "typed" or "pressed keys". After `screenshot`, `zoom`, `wait`, and `cursor_position`, it records "looked". These keep the bot's last position, since the pointer may be another bot's.
- **`computer_shell`** records "browser" when the command runs `agent-browser`, "desktop app" for `agent-desktop`, and "shell" otherwise. **`computer_terminal`** records "terminal".
- **What a bot reads.** When other bots have marks on the computer, `computer_desktop`'s result text gains one line, with at most five, newest first:

  ```text
  Others on this computer: Ann clicked (412, 300) 2 min ago; Bob used the browser 20 s ago.
  ```

  A bot's own computer has no other bots, so its results don't change.
- **`GET computers/:key/cursors`** answers `{ screen: [w, h], marks: [{ bot, x, y, what, at }] }`, from memory, with no call to the engine.
- **The gap.** agent-desktop's `--headed` and `--xy` commands move X's pointer without a mark. The arrow then stays where the bot last clicked by pixels.

**The overlay** (`page.jsx`):
- `Cursors({ computer })` sits over the desktop on the Computer screen, not over a bot panel's small peek. It is a box at the same inset as noVNC's, with `pointer-events: none`, so **Take over** clicks through it.
- **Its data:** while the **Desktop** tab shows and the page is visible, it reads `cursors` once a second.
- **Where an arrow goes:** at the same place noVNC draws, as noVNC fits and centres the screen:

  ```js
  const scale = Math.min(box.width / w, box.height / h);
  const left = (box.width - w * scale) / 2 + x * scale;
  const top = (box.height - h * scale) / 2 + y * scale;
  ```

  A `ResizeObserver` on the box keeps the positions current.
- **An arrow:** an 18-pixel arrow in the bot's colour, from `useBots()`, with a pill of its name, what it did, and how long ago, such as "Ann · clicked · 2 min". Arrows keep their size at every scale.
- **Which one is solid:** the newest mark is solid, and the others are at 45% opacity.
- **Bots without a position** show as pills in a row at the top left.
- A bot's own computer shows its one arrow, beside the real pointer that Xvnc draws.

### Chat rooms 0.3.0

`server.ts`, after its maps load:

```ts
// For plugins that need chat rooms: the room a session of ours is for, and every room.
fx.provide?.({
  roomOf: async (session: string) => (roomOf.has(session) ? await room(roomOf.get(session)!) : null),
  rooms: async () => Promise.all((await fx.sql<{ id: number }[]>`select id from rooms order by id`).map((r) => room(r.id))),
});
```

`room()` already answers null for a room that's gone, so a stale entry in `roomOf` gives null.

`page.jsx`: `{Slot && room && <Slot name="chat-rooms.room-header" props={{ room }} />}` before **Edit**, with `Slot` from `@fxbot/app`. With no plugin filling it, the header is as before. On fxbot 0.4, where `Slot` and `fx.provide` don't exist, the room works as in 0.2.0.

### chat-rooms-computer 0.1.0

`plugin.json`:

```json
{
  "name": "chat-rooms-computer",
  "version": "0.1.0",
  "description": "A computer for a chat room: its bots share one machine, taking turns, and you see where each last pointed.",
  "license": "Apache-2.0",
  "extensions": {
    "sh.fxbot": {
      "server": "./fxbot/server.ts",
      "page": "./fxbot/page.js",
      "migrations": "./fxbot/migrations",
      "needs": { "computer": {}, "chat-rooms": {} }
    }
  }
}
```

Its `needs` blocks are empty, so the computer's image doesn't change when it's added.

`0001_computers.sql`:

```sql
-- Each room given a computer: the key that names the computer and its home, and whether the room uses it now.
create table computers (room int primary key, key text not null unique, enabled boolean not null default true);
```

A room's key is `room-` and 8 random hex characters, made the first time it's turned on and kept. Turning the computer off and on again finds the same home. A key from an earlier install of this plugin is never reused.

**`server.ts`**, about 110 lines:
- **Setup** throws "chat-rooms-computer needs fxbot 0.5.0 or newer." when `fx.need` isn't there. The plugin then stays added but off, with that on its row.
- **`rooms = () => fx.need("chat-rooms")`**, read at each use.
- **`roomComputer(session)`** gives the room and the key when the session is a room's and that room's computer is enabled.
- **`fx.provide({ computerFor, computers })`:**
  - **`computerFor({ bot, session })`** answers null at once unless this plugin's `instructions` hook reached that session this turn: `reached`, as chat-rooms' own check works (R:57, R:160-179). So a bot this plugin is off for uses its own computer, and a session that isn't a room's costs one set lookup. Otherwise it answers `{ key, name: room.name }`.
  - **`computers()`** answers null while chat rooms isn't running. Otherwise it lists every row whose room still exists, with the room's name. A deleted room's computer is then removed on the computer's next sweep.
- **`fx.on("message")`:** for a message from chat-rooms to a room session whose computer is on, it puts `$room-computer` before the text the first time since this start for that session. The skill then goes with that turn, as `$chat-room` does.
- **`fx.on("instructions")`:** for a room session whose computer is on, it marks the session reached, and adds one entry:

  > This room has a computer of its own, which you share with Ann and Bob, taking turns: during your turns here, your computer tools reach it, not your own. Someone may have changed it since your last turn, so look before you act. Your skill room-computer says how to share it.

  For any other session it unmarks the session.
- **Routes:**
  - `GET /rooms/:id` answers `{ on, key }`.
  - `PUT /rooms/:id` with `{ on }` makes the key when it's first turned on, sets `enabled`, and answers the same. A room chat rooms doesn't have gets 404.

**`skills/room-computer/SKILL.md`**, with `disable-model-invocation: true` as the room's other skills have. Its description: "How to share a chat room's computer with the room's other bots. Use when the room has a computer." It says:
- The room's computer is one machine for every bot in the room, used in turns. During your turn it's yours. Your own computer is for your own chats.
- **Look first.** Take a screenshot, run `agent-browser snapshot -i` or `agent-desktop snapshot`, and read the terminal with `computer_terminal` and no text. Someone may have left it changed.
- **The browser is shared, with its sign-ins.**
  - Start your work in a tab of your own: `agent-browser tab new --label <your name> <url>`.
  - Come back to it with `agent-browser tab <your name>`, which brings it to the front, so the screen shows it.
  - Leave the others' tabs open, and don't sign out of anything.
- **The terminal, `main`, is everyone's.** Leave it at a prompt when your turn ends. Run a server with `setsid` through `computer_shell`, not in the terminal.
- **Files.** `/root` is shared. Keep your own work in `/root/<your name>/`, and put what's for the room where you tell the room.
- **Say in the room** what you did on the computer and where, so the next bot can carry on.
- **For what only the owner can do,** call `computer_ask_owner`. The owner tags you when it's done.

**`page.jsx`**, about 70 lines:
- `app.slot("chat-rooms.room-header", RoomComputer)`.
- `RoomComputer({ room })` reads `GET rooms/:id`, and draws a screen button, with a dot while the computer is on. It opens a `ui.Dialog`:
  - Off: "Give {room} a computer of its own. Its bots share it in this room, taking turns, and keep their own computers for their own chats." and a `ui.Switch`.
  - On: the switch, **Open**, which goes to `/computer/computers/<key>`, and "Turning it off stops it and keeps its files."
  - Turning it off sends `PUT` with `{ on: false }`, then `POST /api/plugins/computer/computers/<key>/stop`, the computer's own route.
- It has no dependencies of its own, so it's built with rolldown as chat-rooms' page is, and has no license notice to ship.

### On fxbot 0.4

- **computer 0.3.0** on fxbot 0.4.1: dependents carry no `api`, so every call uses the bot's own computer, as in 0.2.2.
- **chat-rooms 0.3.0** on fxbot 0.4.1: `fx.provide?.` and the `Slot` check leave it as 0.2.0.
- **chat-rooms-computer** on fxbot 0.4.1 refuses to load, with its error on its row.

### Speed and cost

- **Loading the page, sending a message, and streaming a reply:** unchanged.
  - The computer's `page.js` grows by the overlay, about 3 KB.
  - Chat rooms' grows by one line.
  - The new plugin's page code, about 5 KB unbuilt, loads only when it's added.
- **Each computer call** loops over the dependents:
  - none provide anything without the new plugin
  - with it, a call outside a room costs one set lookup
  - in a room, a call costs three small indexed queries: chat rooms' `room()` and this plugin's row
- **Watching a computer:** one in-memory read a second while the Desktop tab shows, and no engine call.
- **Memory:** a few marks per computer.
- **A room's computer** costs what a bot's does: about 120 MB of memory while it runs idle, and its home on disk.

### Not in this phase

- **Turns at once in a room,** and with them a lock, a tab and session for each bot (`--session` with `--pin-tab`), and a tmux window for each bot.
- **Cursors in X or in screenshots:** agent-desktop's cursor overlay, MPX, `scrot --pointer`.
- **A live view beside the room** (open question 1), and Hand back waking the bot (open question 2).
- **Reset of a room's computer from the room.** Deleting the room, or **Delete all computers**, removes it.
- **Computers for other groups,** such as a team's. Another plugin can provide `computerFor` the same way.
- **Two things every computer has today**, each for its own patch of the computer:
  - **Take over** doesn't wait for a bot's running call. OpenBot drains running calls first.
  - A modifier key can stay held after a take-over. openmuse releases every modifier before each xdotool action.
- **Marks that last** across a restart.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| Core, `packages/sdk` | `fx.provide`, `fx.need`, and `api` on `fx.dependents()`, with their types | about 20 |
| Core, `packages/ui/src/plugins.tsx` | `app.slot` and `Slot` | about 10 |
| `plugins/computer` → 0.3.0, `server.ts` | Keys in every map, route, and socket; `computerOf`; keeping and removing dependents' computers; `known`; take-over by key, and hand-back only to a bot's own; marks, their line in desktop results, and the cursors route | about 110 new, about 60 changed |
| `plugins/computer` → 0.3.0, `page.jsx` | The screen by key, its title, the overlay, and Settings' names | about 70 |
| `plugins/chat-rooms` → 0.3.0 | `provide({ roomOf, rooms })`, and a `Slot` in the room's header | about 15 |
| `plugins/chat-rooms-computer` 0.1.0 | Manifest, `package.json`, migration, `server.ts`, and `page.jsx` | about 200 |
| The skill and the three READMEs | `room-computer`, the new README, and the computer's and chat rooms' changes | about 120 |
| Docs, list, and changelog | Plugin API, Give bots a computer, The computer, Talk with several bots in a room, `plugins-registry.json`, and `CHANGELOG.md` | about 70 |

Size: about 30 lines of core and about 400 of plugin code, with about 190 of skill, READMEs, and docs. The draft planned about 45 and 470: the lock, the windows for each bot, the room panel, and the hand-back plumbing are gone. An install without `chat-rooms-computer` runs nothing new.

## 4. Checklist

Checks use the computer phase's harness:
- a disposable Postgres, and the check server on its own port and `FXBOT_DATA`, with `FXBOT_PLUGIN_DIRS` naming `plugins/computer`, `plugins/chat-rooms`, and `plugins/chat-rooms-computer`
- the mock model making scripted tool calls, with `@Name` handoffs in rooms
- Playwright at desktop and phone widths

Containers run under the box's rootless podman for its `agent` user (uid 1000), as `/root/.claude/projects/-root-github-fxbot/memory/test-environment.md` describes:
- Start its `dbus.socket` and `podman.socket` user units for the checks: `runuser -u agent -- env XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus systemctl --user start dbus.socket podman.socket`, from a folder it can read, such as `/tmp`.
- Set the computer's `engine` setting to `/run/user/1000/podman/podman.sock`.
- Afterwards, stop the units and remove the containers, volumes, and images the checks made.
- Nothing is added to the machine: no user, firewall, or unit. Ask the owner first for anything more.

The owner's dev server runs from this checkout:
- Don't switch branches.
- Edit files under `packages/ui` with the Edit tool, not `sed -i`.
- Never use `pkill -f`.

Scratch plugins live in the scratchpad and aren't committed.

**M1. The plugin API**
- [ ] A scratch plugin `a` calls `fx.provide({ hi: () => "hi" })`, and a scratch `b` with `needs: { a: {} }` answers `fx.need("a").hi()` from a route: `hi`.
- [ ] `b`'s `fx.need("c")` throws "b doesn't name c under needs".
- [ ] After `a`'s file is touched and it reloads, `b`'s next call reaches `a`'s new object. With `a` turned off, `fx.need("a")` is null.
- [ ] `a`'s `fx.dependents()` lists `b` with its `api`. With `b` turned off, `api` is null.
- [ ] `a`'s screen leaves `<Slot name="a.place" props={{ n: 1 }} />`, and `b` fills it with `app.slot("a.place", …)`:
  - the screen shows `b`'s part with `n`
  - with `b` removed, the place is empty
  - with `b`'s part throwing, the error card shows there, and the rest of `a`'s screen stays
- [ ] `npm run typecheck` passes.

**M2. The computer by key**, on the `agent` user's podman
- [ ] With no dependent providing anything, a bot's first call makes `fxbot-computer-<bot>` with hostname `<name>-computer`, as 0.2.2 did. A computer made by 0.2.2 is used again, not made again.
- [ ] A scratch dependent provides `computerFor`, answering `{ key: "room-test0001", name: "Test room" }` for one session, and `computers()`, listing it:
  - a `computer_shell` call in that session makes `fxbot-computer-room-test0001`, labelled `fxbot.by=<the scratch plugin>`
  - `hostname` there answers `test-room-computer`
  - the same bot's own chat still gets `<name>-computer`
- [ ] A skill with a script, read in that session, lands in `/skills/<name>` on `room-test0001`, not on the bot's own computer.
- [ ] Sweeps, with `idleMinutes` at 1:
  - a listed key stays
  - a key the dependent stops listing goes, container and volume
  - with the dependent turned off, or `computers()` answering null, the key stays
  - with the dependent removed, the key goes
  - after a restart, which loads the computer before its dependents, the key stays
- [ ] `/desktop/room-test0001` opens. `/desktop/room-nothere` closes with 1008. `GET computers/room-test0001/state` names "Test room".
- [ ] **Take over** of `room-test0001`:
  - two bots' `computer_desktop` calls in that session answer that the owner has it
  - **Hand back** sends nothing to either bot's own chat
  - `computer_ask_owner` there answers with "they'll tell you to go on"
  - on a bot's own computer, Hand back after `computer_ask_owner` still sends its message
- [ ] Marks:
  - two bots click on `room-test0001`, then `GET computers/room-test0001/cursors` lists both, with x, y, what, and time
  - a later `agent-browser` shell call by the first bot marks it "browser" and keeps its position
  - the second bot's next `computer_desktop` result has the "Others on this computer" line with the first bot
  - on a bot's own computer the line never shows
  - **Stop** and **Reset** clear the marks
- [ ] `npm run typecheck` passes.

**M3. The owner's view**
- [ ] The Computer screen of `room-test0001`, after two bots clicked at (100, 100) and (1100, 700):
  - two arrows show, in the bots' colours, with their names
  - the newest is solid, and the other faded
  - each arrow's tip is within 2 pixels of the point mapped through the canvas's box, at 1280 by 800 and at 390 by 844
- [ ] Whether Xvnc draws the real pointer into the picture after a bot's click is noted, with a screenshot of the screen.
- [ ] After **Take over**, a click on the desktop reaches it through the overlay.
- [ ] With the Terminal tab shown, or the page hidden, the server log shows no `cursors` reads.
- [ ] The screen opens at `/computer/computers/<bot>` and at `/computer/bots/<bot>`. Settings lists the room's computer under its name.
- [ ] `page.js` is built from `page.jsx` by the README's command.

**M4. Chat rooms 0.3.0**
- [ ] From a scratch plugin that needs chat rooms, `roomOf` gives a room session's id, name, and bots, and null for another session and for a deleted room's. `rooms()` lists the rooms.
- [ ] With nothing filling the slot, the room's header looks as before, at desktop and phone widths.
- [ ] `page.js` is built. The version is 0.3.0. The README names `roomOf`, `rooms`, and the slot.

**M5. chat-rooms-computer 0.1.0**
- [ ] With `FXBOT_PLUGIN_DIRS` naming it and chat rooms but not the computer, its row says "It needs computer. Add it first." (`plugins.ts:491`).
- [ ] The room's header shows the screen button. The switch turns the computer on, the dot shows, and **Open** goes to `/computer/computers/room-…`.
- [ ] In a room of Ann and Bob with the computer on, scripted by the mock:
  - Ann runs `hostname; echo hi > /root/note` and tags Bob, and Bob runs `cat /root/note`
  - the hostname is `<room>-computer`, and Bob reads `hi`
- [ ] Ann's first room turn after it's on carries `room-computer`'s text in the mock's request, and every room turn carries the sharing line. A turn in her own chat carries neither, and `hostname` there is `ann-computer`.
- [ ] With the plugin narrowed to Ann alone, Bob's room calls use `bob-computer`.
- [ ] Labelled tabs, with agent-browser 0.41.1 on the room's computer:
  - Ann runs `agent-browser tab new --label ann https://example.com`, then Bob runs `agent-browser tab new --label bob https://example.org`
  - Ann's `agent-browser tab ann` brings her tab to the front, and a `computer_desktop` screenshot shows it
  - this holds whether each names the session the agent-browser skill suggests or none
- [ ] Turned off, the next room call uses the bot's own computer, the room's computer is stopped, and its volume is still there. Turned on again, it uses the same home.
- [ ] A deleted room's computer and volume go on the computer's next sweep. Removing chat-rooms-computer leaves rooms working as in 0.2.0, and its computers go on the next sweep.
- [ ] Updating the computer, by touching its files, with this plugin running doesn't remove the room's computer, and the room's next call finds it.
- [ ] A one-off Node script calls the plugin's setup with an `fx` that has no `need`. It rejects with "chat-rooms-computer needs fxbot 0.5.0 or newer."
- [ ] `page.js` is built from `page.jsx`. The README says what it does and what it needs, and how to build the page.

**M6. The list, docs, and checks**
- [ ] `packages/sdk/src/plugins-registry.json` lists `chat-rooms-computer`, with `repo` `iammrduncan/fxbot` and `path` `plugins/chat-rooms-computer`.
- [ ] The SDK's Plugin API reference covers `fx.provide`, `fx.need`, `api` on `fx.dependents()`, `app.slot`, and `Slot`, each "Since 0.5.0", with a short example of one plugin using another.
- [ ] "Give bots a computer" has a section, "Give a room a computer". "The computer" covers keys, the provider contract, the routes and screen by key, and the cursors. "Talk with several bots in a room" links to the new section.
- [ ] The computer's README covers keys, `ComputerProvider`, the cursors, and the screen's path. Chat rooms' README covers what it provides and its slot. The versions are 0.3.0, 0.3.0, and 0.1.0.
- [ ] `CHANGELOG.md` has an `## Unreleased` section, added if no other 0.5.0 work has added one. It says:
  - a room's computer
  - the three plugin versions, and "update them from Plugins"
  - cursors on the Computer screen
  - for plugins: `fx.provide`, `fx.need`, and `Slot`
- [ ] `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass. New files are checked for whitespace too: `git diff --check` doesn't see untracked files.
- [ ] One commit on `release/0.5.0` per piece: core, computer, chat rooms, the new plugin, and the docs, each with a message that says what changed. Nothing is pushed.

**Bounds.** If the code passes about 600 lines, core and plugins without docs, skill, READMEs, and built pages, stop and say why. Out of scope is everything under [Not in this phase](#not-in-this-phase).

**The human runs these:**
- With two or three bots on real models, give a room a computer. Ask one to find something on a site and another to write it up in a desktop app. Watch the arrows, and see that:
  - each bot looks before it acts
  - each opens a labelled tab of its own
  - no bot signs out or closes the others' tabs
- Ask a bot in the room to sign in somewhere. It should call `computer_ask_owner`. **Take over**, sign in, **Hand back**, and tag it to go on.
- On a phone, open a room's computer through the tailnet, and check the arrows sit on what the bots clicked.
- Look at whether the real pointer and the newest arrow sit together without confusion. If they do confuse, see open question 4.

## 5. Open questions

Each has a default that the build follows unless the owner changes it.

1. **Where the owner watches.**
   - *Default:* the computer's own screen, opened from the room's header, with the cursors drawn there.
   - *The other way:* a small live view beside the room's messages. It needs a second slot in chat rooms' layout, and the computer offering its desktop view to other plugins' pages: about 80 lines more.
2. **Hand back in a room.**
   - *Default:* nothing is sent. The owner tags the bot in the room to go on, and `computer_ask_owner` tells the bot so.
   - *The other way:* chat rooms provides `wake(session, text)`, and Hand back wakes the bot that asked, with a note in the room: about 20 lines across the three plugins.
3. **The terminal.**
   - *Default:* one tmux window, `main`, that every bot and the owner see.
   - *The other way:* a window for each bot, chosen on each call, so a bot's REPL survives the others' turns. The owner then sees only the newest bot's window: about 8 lines in the computer.
4. **The newest bot's arrow.**
   - *Default:* drawn, solid, on top of the real pointer that Xvnc shows.
   - *The other way:* only its name tag beside the real pointer, if M3 finds the two look doubled.
