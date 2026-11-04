# Settings in tabs

Settings becomes a screen of tabs: **General**, **Providers**, **Memory**, **Plugins**, and **About**. Each plugin that draws in Settings gets a tab of its own, between Plugins and About. About is the version, updates, links, and the license. Each tab has its own address.

Status: built on 2026-11-04, for 0.5.0, as planned the same day at the owner's word, and researched against the research directive's references. Where the build differs from the plan, [What the build changed](#what-the-build-changed) says so. The owner asked: "Turn setting into multi tab settings with dedicated about page and allow plugins to add tabs." The owner's decisions:
- The tabs are General, Providers, Memory, Plugins, and About.
- About is a tab of its own.
- Plugins can add tabs.

## 0. Core or plugin

**Core.** Settings is the app's own screen, and what plugins plug into ([Core or plugin](../../../CONVENTIONS.md#core-or-plugin)): a plugin's `app.settings` part is a place in the app. Updates are core too, and About is where they show.

The plugin API keeps its one call. `app.settings(Component)` makes a tab named for the plugin, instead of a section in one long page. No plugin has to change, and the API gains no hook.

## 1. Research

### The references

**OpenBot** (`CopilotKit/openbot`) has the fullest settings screen, and it is a screen of sections, each at its own address.
- **Its own sidebar.** `/settings` swaps the app's sidebar for one of its own, with **Back to app** at the top (`app/src/routes/_authed/settings/route.tsx`, `app/src/components/settings/settings-sidebar.tsx:183`).
- **An address per section.** The sections are General, Notifications, Approvals, Browsers, Learning, Setup, Passwords, and Components gallery. Each is a route under `/settings/` (`settings-sidebar.tsx:50-101`).
- **General is `/settings` itself,** lit only on its own route: "`/settings` prefixes every other route here, and would otherwise light up on all of them" (`settings-sidebar.tsx:52-56`).
- **The list changes with the install.** The personal edition adds Keys, Skills for every Bot, Computer, and Activity, and drops Learning (`settings-sidebar.tsx:109-149`).
- **Why a section becomes a page:** "Connected accounts used to be a section below. It is its own screen now: a connector can need more from a person than one switch, and a section cannot grow a page's worth of that" (`app/src/routes/_authed/settings/index.tsx:36-37`).
- **Plugins aren't in Settings.** An app (a plugin) has its own page under Connections. Old addresses redirect: "Apps were here before they joined Connections. An old address opens the same page there" (`app/src/routes/_authed/settings/_personal/plugins.$.tsx`, `app/src/lib/manage-paths.ts:72-80`).
- **No About page and no version shown in the app** that I could find. The desktop app updates through Tauri (`desktop/src-tauri/src/updates.rs`).
- **On a phone,** the settings sidebar is shadcn's `Sidebar`, which turns into a sheet. That's the component's behavior; I didn't run it.

**OpenDuet** (`CopilotKit/OpenDuet`) is OpenBot copied, with the same settings sidebar: General, Setup, Notifications, Approvals, Passwords, and Components gallery (`openbot/app/src/components/settings/settings-sidebar.tsx:38-70`). No About. Its README sends people to "**Settings → Setup**" to reopen the setup checklist.

**openmuse** (`CopilotKit/openmuse`) has no Settings screen.
- The app is five tabs in a bottom bar: Chat, Activity, Ideas, Goals, and Apps (`apps/mobile/App.tsx:45-51`).
- "The agent's name, tone and memory are editable in Apps" (`docs/EXPERIENCE.md`).
- Apps ends with a status block, the closest thing to an About: **Environment**, **Assistant**, and **Rich Threads**, each a label and a value (`apps/mobile/src/screens.tsx:1350-1369`).

**OpenDots** (`CopilotKit/OpenDots`): Settings is one dialog, "Your workspace, your rules." It holds two parts (`src/client/WorkspaceDialog.tsx:114, 427-475`):
- **Appearance:** System, Light, or Dark, "Saved in this browser."
- **Service setup:** which environment variables are missing.

It has no tabs and no About.

**Pi** (`earendil-works/pi`): settings is one flat list, and extensions can't add to it.
- `/settings` opens one searchable list (`packages/coding-agent/src/modes/interactive/components/settings-selector.ts:170, 999`, `SettingsList` with `enableSearch`).
- Extensions don't reach it: "Built-in interactive commands (like `/model` and `/settings`) are not included here" (`docs/extensions.md:1802`).
- An extension with settings registers a command of its own and draws its own list. The `tools` example opens a `SettingsList` from `/tools` (`examples/extensions/tools.ts:67-97`).
- What an About page holds is spread over commands: `/changelog` "Show changelog entries" (`src/core/slash-commands.ts:32`), and `/session` shows the session's file, ID, and cost (`docs/usage.md:62`).
- Its experimental web UI, p2, has no settings screen (`apps/p2/src/web/`).

**fx** (`vercel-labs/fx`): settings and status are two commands.
- `/settings`: "browse and update settings" (`src/builtins/commands.zig:720`).
- `/status`: "show runtime configuration and the session ID" (`src/builtins/commands.zig:706`).
- A new build shows in the footer as "update ready: ctrl+g to reload" (`src/ui/footer/input_presentation.zig:549, 1821`), as fxbot's sidebar shows **New version** and **Reload**.

**eve** (`vercel/eve`) has no settings screen.
- `/model` and `/login` change the model and the provider.
- `/info` will "Show application and messaging information" (`packages/eve/src/cli/dev/tui/prompt-commands.ts:52-153`), as `eve info` does on the command line (`packages/eve/src/cli/commands/info.ts`).

**Grok Bot** (`docs.x.ai/grok-bot`, docs only):
- **Settings has named sections:** "Settings → Account" to connect X, "Settings → General" for Import, and "Settings → Usage & Billing".
- **Bots have no settings page:** "Personal Bots no longer have a 'Bot settings' page"; you tell the Bot in chat.
- **Updates:** the desktop app "checks for updates automatically."
- **Not documented:** an About page, tabs, and how Settings is laid out.

**agent-browser** (`vercel-labs/agent-browser`): its dashboard is shadcn tabs over a browser session (Chat, Activity, Console, Network, Storage, and Extensions; `packages/dashboard/src/app/page.tsx:48-81`). It has no settings, and its Extensions tab lists Chrome's extensions.

**Nothing on settings** in fx0, durable-harness, or agent-desktop:
- **fx0:** the model is picked in the message box.
- **durable-harness:** its demo keeps its choices in `localStorage` (`packages/demo-ui/src/Shell.tsx:148-161`).
- **agent-desktop:** a command-line tool.

### Other products

These are the best prior art for plugin tabs and About, beyond the list.

- **Obsidian** gives each plugin a tab: `this.addSettingTab(new ExampleSettingTab(this.app, this))` ([docs](https://docs.obsidian.md/Plugins/User+interface/Settings)).
  - Its `SettingTab` has an `icon`, "The icon to display in the settings sidebar" (since 1.11.0), but no name field (`obsidian.d.ts`, `SettingTab`, from `obsidianmd/obsidian-api`). So the app names the tab, not the plugin.
  - The tabs are listed under a **Community plugins** heading, by plugin name, and General shows the version with a check for updates. Both are from using Obsidian, not checked today.
- **VS Code** has one Settings editor with a table of contents.
  - An extension's settings are categories: "The `title` of a category is the heading used for that category."
  - With several categories, "the Settings editor will show a submenu in the table of contents for that extension", and `order` sorts them ([contribution points](https://code.visualstudio.com/api/references/contribution-points)).
  - About is a dialog under Help, with the versions of its parts. That's from use, not checked today.
- **Chrome:** the settings sidebar ends with **About Chrome** (`chrome://settings/help`), which shows the version and checks for and applies updates. From use, not checked today.
- **ChatGPT:** Settings is a dialog with its sections in a column on the left. OpenAI's help says to "select Settings, then select Data controls" ([help](https://help.openai.com/en/articles/7730893-data-controls-faq)). Third-party guides disagree on the list of sections, so I couldn't verify the current one.
- **opencode:** its desktop app has "registries for commands, panels, settings pages" ([plugins phase](plugins.md)). That's from 0.4.0's research, not checked today.

### fxbot today

- **One column.** `SettingsForm` (`packages/ui/src/app.tsx:507-550`) holds, in order:
  - the install prompt
  - the providers and the default provider (`Providers`, `providers.tsx:145`)
  - "New bots start on the default provider"
  - memory search (`MemorySearch`, `memory-search.tsx`)
  - **Show unvetted plugins**
  - each plugin's `app.settings` part (`<Place pick={(places) => places.settings} />`, `app.tsx:544`)
  - `Version` (`release.tsx:14`), which is the version and, when one is out, the update
- **Only the computer plugin draws there:** `app.settings(SettingsSection)` (`plugins/computer/fxbot/page.jsx:490`).
- **One route,** `path === "/settings"` (`app.tsx:125`), and the sidebar's button lights only on it (`app.tsx:300`).
- **Two links point into it:** a chat with no provider (`app.tsx:756`), and the Plugins page's "unvetted plugins in Settings" (`plugins-page.tsx:221`).
- **The New version row in the sidebar** reloads the page onto a new build (`pwa.ts`, `useNewVersion`). It isn't about releases. Only Settings shows that a release is out.
- **The UI has shadcn's `tabs`** (`components/ui/tabs.tsx`). The Plugins page and the bot panel use them for panels that don't change the address.

## 2. Key takeaways

1. **Each tab has an address.** Products with a real settings screen give each section a route, with General at the bare address (OpenBot). Then links, Back, and a reload all land on the tab.
2. **A column on the left on a wide screen,** and something narrower on a phone (OpenBot, ChatGPT, Obsidian, and VS Code). fxbot keeps its own sidebar of bots, so the column goes inside the page, and on a phone it becomes a row.
3. **Tabs that change the address are links.** Radix tabs move on arrow keys, so each arrow press would push a history entry. Links with `aria-current="page"` are navigation, and they're what the sidebar's footer already uses.
4. **A plugin's tab is named by the app.** Obsidian's tabs carry a plugin's icon but take its name from the app. VS Code nests an extension's categories under its name. fxbot already has `app.settings`, so making it a tab named for the plugin needs no new API.
5. **Plugin tabs need their own space in the address.** A plugin can be named `general`, `providers`, or `about`, so its tab goes under `/settings/plugins/<plugin>`, like Obsidian's Community plugins heading.
6. **About is where the version and updates live** (Chrome, Obsidian, and VS Code). It comes last, and links out to the docs and the source. The references keep this in commands (fx `/status`, eve `/info`, Pi `/changelog`) or a status block (openmuse).
7. **Old addresses keep working** (OpenBot's redirects). `/settings` stays, and opens General.
8. **Move the parts; don't rewrite them.** `Providers`, `MemorySearch`, `Version`, and the plugin parts are already self-contained, so each becomes a tab as it is.

## 3. Implementation

### The tabs

| Tab | Address | What it holds |
| --- | --- | --- |
| **General** | `/settings` | Install fxbot as an app: the prompt, the iOS steps, or "fxbot runs as an app on this device" when it does. The default bot, from [default bot](default-bot.md). |
| **Providers** | `/settings/providers` | `Providers` as it is, then "New bots start on the default provider, with its default model." |
| **Memory** | `/settings/memory` | `MemorySearch` as it is |
| **Plugins** | `/settings/plugins` | **Show unvetted plugins**, its text, and a line that links to **Plugins** to add, update, and remove them |
| *each plugin's* | `/settings/plugins/<plugin>` | Its `app.settings` parts, stacked, each in its error boundary |
| **About** | `/settings/about` | `Version` as it is: the version, and the update when one is out. Then the links and the license. |

- **Plugin tabs** come in the order the app loads plugins, as the sidebar's plugin buttons do.
- **A plugin's label** is its name, with its first letter capitalized and dashes as spaces. `computer` becomes **Computer**, and `chat-rooms` becomes **Chat rooms**.
- **Icons.** The core tabs have lucide icons: General `SlidersHorizontal`, Providers `KeyRound`, Memory `Brain`, Plugins `Puzzle`, and About `Info`. A plugin's tab shows its icon from [plugin icons](../../phases/plugin-icons.md) once that's built, and no icon until then.
- **An unknown address,** such as a plugin's tab before its page code has loaded or after it's removed, shows the tab list with an empty pane. When the plugin loads, its tab appears. A plugin's screen already shows "Not found" until then.

### About

```
fxbot 0.5.0 · 0.5.1 is out          ← Version, as it is today
[notes]  Release notes  [Update to 0.5.1]

fxbot.sh · Docs · Changelog · Source code
Apache License 2.0
```

- **The links** open in a new tab:
  - `https://fxbot.sh`
  - `https://fxbot.sh/docs/`
  - `https://fxbot.sh/docs/reference/changelog/`
  - `https://github.com/iammrduncan/fxbot`, the repository in `package.json`
- **The license** links to the repository's `LICENSE`.
- **No new request.** `Version` already reads `GET /api/update`, and only when About is open.

### Layout

**At 1024 px and wider** (`lg`), the tabs are a column, 12rem wide, to the left of the tab's content. The content keeps today's `max-w-xl`. At 1280 px with the bots' sidebar open, that's 16rem of bots, 12rem of tabs, and the rest for the content.

```
┌ bots ────┐┌ ☰ Settings ─────────────────────────────┐
│ ● Bob    ││  General     │  Providers               │
│ ● Jill   ││▸ Providers   │  [provider row]          │
│          ││  Memory      │  [provider row]          │
│          ││  Plugins     │  Add provider…           │
│          ││  Computer    │                          │
│ ⚙ Settings│  About       │                          │
└──────────┘└──────────────┴──────────────────────────┘
```

**Below 1024 px,** the tabs are one row under the header. They're pills that scroll sideways, and the active one scrolls into view. The content scrolls under the row, and the page itself never scrolls sideways.

```
┌ ☰ Settings ───────────────────┐
│ (General)(Providers)(Memory)(P→│
│───────────────────────────────│
│ Providers                     │
│ [provider row]                │
└───────────────────────────────┘
```

**The markup** is `<nav aria-label="Settings">` with one `<a>` per tab. Each link uses `onClick={follow}` and `aria-current="page"` on the open tab, styled like the sidebar footer's links (`buttonVariants({ variant: "ghost" })`).

### Code

**`packages/ui/src/settings.tsx`** (new) takes `SettingsForm` out of `app.tsx`:

```tsx
// Settings, in tabs, each at its own address: /settings is General, a plugin's is /settings/plugins/<plugin>, and
// About is last. `tab` is what follows /settings/.
export function SettingsScreen({ tab }: { tab: string }): ReactNode;
```

- It reads `client.settings.get()` once, for the tabs that need it: Providers' default provider, and Plugins' switch.
- It builds the tab list from a constant for the core tabs and `usePluginSettings()` for the plugins'.
- It draws the open tab:
  - A plugin's parts go in `PluginPart` boundaries (`plugins.tsx`).
  - The error line is a `<p role="alert">` of its own, not `app.tsx`'s `Problem`, to keep the import one-way.

**`packages/ui/src/plugins.tsx`** gets one hook:

```ts
// Each loaded plugin that draws in Settings, with its parts, in load order: a tab each.
export function usePluginSettings(): { name: string; parts: ComponentType[] }[];
```

**`packages/ui/src/app.tsx`:**
- **The route:** `else if (top === "settings") screen = <SettingsScreen tab={path.split("/").slice(2).join("/")} />;`, which replaces `path === "/settings"`.
- **`SettingsForm` goes,** with the imports only it used.
- **The sidebar's Settings button** is active on `/settings` and on every address under it.
- **A chat with no provider** links to `/settings/providers`.

**`packages/ui/src/plugins-page.tsx`:** "unvetted plugins in Settings" links to `/settings/plugins`.

**`packages/ui/src/pwa.ts`:** exports `standalone`, for General's "fxbot runs as an app on this device."

**Nothing changes** in the SDK, the server, the plugin API's signature, or the database.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/ui/src/settings.tsx` | `SettingsScreen`: the tab list, the layout, and each tab's content; About's links | about 125, of which about 40 move from `app.tsx` |
| `packages/ui/src/app.tsx` | `SettingsForm` out; the `/settings/*` route; the button's active state; the provider link | about 45 out, 4 in |
| `packages/ui/src/plugins.tsx` | `usePluginSettings()` | about 6 |
| `packages/ui/src/plugins-page.tsx`, `pwa.ts` | The link; `standalone` exported | 2 |
| `packages/website/.../sdk/reference/plugin-api.md` | `app.settings` makes a tab, at `/settings/plugins/<plugin>`; several calls stack in it | about 3 |
| `packages/website/.../docs/` how-tos and tutorial | Where things are now: see M5 | about 12 |
| `CHANGELOG.md` | Under `## Unreleased` | about 3 |

Size: about 90 new lines of code, net of the move, and about 15 lines of docs. It adds no request and no package. Page weight grows by under 1 KB gzipped, since the parts were already in the bundle.

### Not in this phase

- **A plugin's declared settings,** the fields in its `plugin.json`. They stay on its page in **Plugins**, with its switch, its bots, and its log ([open question 1](#5-open-questions)).
- **A mark on the sidebar's Settings button** when a release is out. That needs a request at launch.
- **A Check now button for releases.** The server checks once a day.
- **Search across settings,** as Pi, VS Code, and Obsidian have. fxbot has five tabs of a few rows each.
- **Libfx's and Postgres's versions in About.** That needs a server change.
- **The computer plugin's text.** It says "see its section in Settings" (`page.jsx:183`). A later computer release can say "its tab", or link to `/settings/plugins/computer`. The core doesn't name it.
- **The bot's own settings screen** (`/profiles/<id>/edit`) stays one page.

## 4. Checklist

Checks run against a disposable Postgres and `FXBOT_DATA`, on another `FXBOT_PORT`, with the computer plugin loaded from `FXBOT_PLUGIN_DIRS=plugins/computer`. Playwright runs at 1280×800 and 375×667. Don't start a server on the owner's dev port.

**M1. The tabs**
- [x] `/settings` shows General, and its tab is the one with `aria-current="page"`.
- [x] `/settings/providers`, `/settings/memory`, `/settings/plugins`, and `/settings/about` each open their tab.
- [x] Clicking a tab changes the address without reloading the page. Back returns to the tab before. A reload stays on the tab.
- [x] General shows **Install** where the browser offers it, the iOS steps on iOS Safari, and "fxbot runs as an app on this device" in the installed app. Headless Chromium offers no install, so the check saw the new line for that case; the prompt, the steps, and the installed line are the code that was there before, moved, and left for the owner's phone check below.
- [x] Providers lists the providers, sets the default provider, and opens **Add provider…** as before. Memory works as before.
- [x] Plugins' switch saves `unvetted` (`GET /api/settings` shows the change), and its link opens `/plugins`.
- [x] The sidebar's Settings button is active on every `/settings` address.
- [x] A bot with no provider shows a Settings button that opens Providers. The Plugins page's "unvetted plugins in Settings" link opens the Plugins tab.

**M2. Plugin tabs**
- [x] With the computer plugin, a **Computer** tab sits between Plugins and About, at `/settings/plugins/computer`. Its section works: the engine's state shows. **Rebuild image** wasn't pressed, since it rebuilds the machine's real image; it's in the owner's checks below.
- [x] Opening `/settings/plugins/computer` in a new tab shows that tab once the plugins load.
- [x] A scratch plugin in `FXBOT_PLUGIN_DIRS` with two `app.settings` calls gets one tab, with both parts in it.
- [x] A part that throws shows its error card inside its tab, and the other tabs keep working. Delete the scratch plugin after.
- [x] With no plugin that calls `app.settings`, there are exactly five tabs.
- [x] Turning the computer plugin off in **Plugins** removes its tab. Its address then shows the tab list and an empty pane.

**M3. Layout**
- [x] At 1280×800, with the bots' sidebar open, the tabs are a column left of the content.
- [x] At 375×667, the tabs are one row under the header that scrolls sideways, and the active tab is in view on load. `document.scrollingElement.scrollWidth <= innerWidth`.
- [x] Tab moves through the tab links, Enter opens one, and the focus ring shows.
- [x] Light and dark both read: the active tab stands out in each.

**M4. About**
- [x] About shows `fxbot <version>`, the four links, and the license, each opening in a new tab at the address in [About](#about).
- [x] In a checkout, with a newer release out, About shows the notes and "Settings updates an install made by setup.sh. This checkout updates with git."

**M5. Docs and checks**
- [x] `packages/website/src/content/docs/sdk/reference/plugin-api.md`: `app.settings(Component)` is "A tab of its own in Settings, named for the plugin, at `/settings/plugins/<plugin>`. Several calls stack in that tab. Before 0.5.0, a section of Settings' one page."
- [x] These pages, under `packages/website/src/content/docs/`, say where things are now:
  - `docs/how-to/memory-search.md`: Settings › Memory.
  - `docs/how-to/add-a-plugin.md` and `docs/how-to/add-an-mcp-server.md`: Settings › Plugins.
  - `docs/tutorials/first-fxbot.md`: Install in Settings › General, and Settings › Providers.
  - `docs/how-to/add-a-provider.md`: Settings › Providers.
  - `docs/how-to/update.md` and `docs/explanation/releases.md`: Settings › About.
  - `docs/how-to/give-bots-a-computer.md`: Settings › Computer.
  - `docs/explanation/security.md`: Settings › Plugins.
- [x] `grep -rn "below Providers\|under \*\*Plugins\*\*\|Under Providers" packages/website/src/content/docs` finds nothing.
- [x] `CHANGELOG.md` has `## Unreleased` above 0.4.1, with: "**Settings in tabs:** General, Providers, Memory, Plugins, and About, each at its own address, and a tab for each plugin that draws in Settings, such as Computer. About has the version, updates, and links." Under it, for plugins: "`app.settings` makes a tab, at `/settings/plugins/<plugin>`."
- [x] `npm run typecheck`, `npm run build`, and `npm run build-site` pass.
- [x] `git diff --check` passes, and the new `settings.tsx` has no trailing whitespace.
- [x] One commit on `release/0.5.0` says what changed. Not pushed.

**Bounds.** About 90 new lines of code. Stop and ask if `settings.tsx` passes 200 lines, or if the work needs the SDK, the server, a migration, or a new package. Out of scope: [Not in this phase](#not-in-this-phase).

**The human checks these by hand:**
- On a phone, in the installed app on iOS and Android: swipe the tab row, check the notch and home-indicator insets, and check that a tab's content scrolls under the row.
- With the computer's engine really set up, the Computer tab's **Rebuild image** and **Delete all computers**.
- In a release install with an update out, **Update** from About. Use another `COMPOSE_PROJECT_NAME`, `FXBOT_PORT`, and `FXBOT_ROOT`, clear of a real install.
- That the tab names and their order read right.

## What the build changed

- **General's line for a browser that offers no install.** "fxbot can run as an app of its own: install it from the browser's menu, where the browser offers it." Without it, General was empty in a desktop browser that hadn't offered to install, such as Firefox or a Chrome window of an app already installed.
- **The effect that keeps the open tab in view returns nothing.** Chromium's `scrollIntoView` now returns a promise, and an effect that returned it crashed the page when the tab changed ("l is not a function"). The effect is `void`.
- **More pages name their tab** than the checklist listed: Add a skill, Core and plugins, Commands, the computer's reference, Providers, and Write a plugin. Add an MCP server's line about a bot's **Edit** page now says "in its **Plugins** section", so the grep in M5 finds nothing.
- **Size:** `settings.tsx` is 151 lines, about 40 of them moved from `app.tsx`; `app.tsx`, `plugins.tsx`, `plugins-page.tsx`, and `pwa.ts` lost 56 lines and gained 14. That's about 70 new lines, under the 90 planned.
- **Checks** ran against a disposable Postgres on 55460 and a server on 18850, with Playwright at 1280×800 and 375×667, light and dark. About's update notes were checked against a stand-in for GitHub's `releases/latest`.

## 5. Open questions

1. **A plugin's declared settings.** The fields a plugin declares in its `plugin.json`, such as a key, are set today on its page in **Plugins**, beside its switch, its bots, and its log. Obsidian and VS Code put all of an extension's settings in Settings.
   - Should a plugin's Settings tab also show those fields, and should a plugin with only those fields get a tab?
   - *Default:* no. They stay in **Plugins**, and a tab holds only what `app.settings` draws.
