# A default bot

The owner picks one bot as the default, in Settings › General. Launching fxbot then opens that bot's chat, where it left off, instead of "Pick a bot".

Status: built on 2026-11-04, for 0.5.0, as planned the same day at the owner's word, and researched against the research directive's references. Where the build differs from the plan, [What the build changed](#what-the-build-changed) says so. The owner's decisions:
- **A cold launch at `/` opens the default bot's ongoing chat.** It does not start a new session.
- **Links into other screens still open those screens.**

## 0. Core or plugin

**Core.** Which screen the app opens on is part of the app's shell, and the default is one value in the core's settings. A plugin would need a new hook into the app's first screen and into its launch, which would be larger than the feature. Nothing here is a feature that only some owners would add: an owner who never picks a default sees no change.

## 1. Research

### The references

**Grok Bot** (`docs.x.ai/grok-bot`, docs only) has the same idea, as a "primary Bot":
- **What it is:** "Your primary Bot is your main point of contact." It "checks in with you on its own and coordinates work with your other Bots" (`/grok-bot/bots`).
- **Without one,** the app shows "Introducing your primary Bot", to create one or choose an existing Bot.
- **Changing it:** right-click it in the sidebar and choose "Replace with different Bot". On iPhone and Android, use "Replace Primary Bot…" in the Bot's menu. A shared Bot can't be primary.
- **The first run** "sets up your first Bot, named **Grok Bot**, and opens a chat with it" (`/grok-bot/get-started`).
- **On X,** tagging @bot hands the post to "your main Bot" (`/grok-bot/tag-on-x`).
- **Not documented:** what the app opens to on a later launch, and whether the primary Bot is marked in the sidebar.

**OpenDuet** (`CopilotKit/OpenDuet`) opens on one ongoing chat with one Bot:
- **`/` is that chat:** "Chat: the person's one ongoing conversation with the product's own Bot" (`openbot/app/src/routes/_authed/_app/index.tsx:4`).
- **The chat is the Bot's newest:** "It is that Bot's most recent channel… With no channel yet, the first message makes one and the conversation carries on in place" (`openbot/app/src/components/shell/chat-screen.tsx:42-48`).
- **The Bot is set in config, not by the person:** it's the Bot whose id is the tenant's, in `examples/openduet/agents.yaml`, and otherwise the deployment's default (`openbot/app/src/lib/agents/primary-bot.ts:20-31`).
- **Other Bots** are reached from `/start`: "The Chat tab is one ongoing conversation with the product's own Bot; this is where a message goes to any other Bot" (`openbot/app/src/routes/_authed/_app/start.tsx:26-27`).
- **No placeholder while it loads:** "Nothing while the first answers load: a placeholder inside a local round trip is a flicker" (`chat-screen.tsx:70`).

**OpenBot** (`CopilotKit/openbot`) opens on a message box, not on a Bot:
- **`/` is a composer** that routes a new conversation to the right Bot: "OpenBot picks the right Bot. Type `@` to choose one" (`app/src/routes/_authed/_app/index.tsx:102`).
- **Its default Bot** is the deployment's, not the person's. It's the Bot with id `picked-harness` (the harness picked at install, `PICKED_HARNESS_IMAGE`), else the first public Bot, else the first (`app/src/lib/agents/default-agent.ts:5-14`, `server/src/routing/service.ts:14-22`). The default catches what routing can't place.
- **Its OpenMuse skin** puts one Bot at the center. That Bot is, in order, "the Bot of the conversation on screen, the Bot the person last chose, and OpenBot's own default Bot" (`app/src/skins/openmuse/model.ts:15-21`).
  - The choice is "Kept in this browser, and kept per signed-in person… Choosing a Bot changes nothing on the server" (`app/src/skins/openmuse/chosen-bot.ts:3-7`).
  - Choosing a Bot opens "its one-to-one conversation the roster already lists first", or a new one if it has none (`model.ts:36-41`, `bots-sheet.tsx:39-47`).

**openmuse** (`CopilotKit/openmuse`) is one agent. It opens on Chat (`apps/mobile/App.tsx:147`), and "One main conversation is the default… its identifier is saved in the workspace; side chats have separate conversation context" (`docs/EXPERIENCE.md:7`).

**OpenDots** (`CopilotKit/OpenDots`) opens on the oldest Dot.
- **The oldest Dot** is the first in the list, which is ordered by `createdAt` (`src/client/App.tsx:143`, `src/server/workspace.ts:104-106`).
- **It opens on Chat with no thread picked,** which shows a new-conversation screen (`App.tsx:63-66, 617-640`).
- **Slack** goes to `SLACK_DOT_ID`, or to the oldest Dot without one (`src/server/platform.ts:56-61`). It's an environment variable, not a choice in the app.

**Pi** (`earendil-works/pi`): the closest prior art for "only a fresh launch".
- **Pi itself** starts a new session. "`--continue` opens the most recent session for the current directory" (`packages/coding-agent/docs/sessions.md:14`).
- **p2,** its experimental web UI ("p2 is a prototype. It will be gone soon"), reopens the last chat when the installed app launches at `/` (`apps/p2/src/web/navigation.ts:182-226, 274`):
  - It reopens "the one open when the app was last used, if that was less than `RESUME_WITHIN` ago", which is two hours.
  - "A browser tab opening `/` (a typed address, the redirect after signing in) starts at home, and a launch with another address (a link) opens that address."
  - It reopens only on "A fresh launch at home (no state of this tab: not a reload, not Back)", and only when `display-mode: standalone` matches.
  - It picks the route before its first render.

**fx** (`vercel-labs/fx`) starts each launch on a fresh session. `/new` "start[s] a fresh session", and `/resume` "resume[s] a saved session" (`src/builtins/commands.zig:692-694`).

**eve** (`vercel/eve`) also starts fresh:
- The chat template's `/` is a new chat's message box (`apps/templates/eve-chat-template/apps/web/app/_components/home-chat-page.tsx`).
- Its terminal's `/new` will "Start a fresh session" (`packages/eve/src/cli/dev/tui/prompt-commands.ts:63-66`).

**fx0** (`vercel-labs/fx0`):
- **Without `?s=`,** `/` is a draft new chat (`app/page.tsx:34-35`).
- **With one,** the page renders that session on the server, before it paints.
- **A new session's id** goes into the address with `history.replaceState` (`components/chat-app.tsx:1001, 1471-1472`).

**Nothing on a default agent** in durable-harness, agent-browser, or agent-desktop. durable-harness's demo remembers its last harness in `localStorage` (`packages/demo-ui/src/Shell.tsx:148-161`).

### Other products

- **Chat apps for many conversations** open on a list or on what was open last: Slack and Discord the last channel, Telegram and WhatsApp the chat list. Assistants open on a new chat: ChatGPT and Claude. All from use, not checked today.
- **A web app's manifest** has one `start_url` for everyone, so a start that depends on the owner's choice has to be made by the page. fxbot's is `/` (`packages/ui/vite.config.ts:64`).
- **Postgres checks a non-deferrable unique index row by row,** not at the end of the statement ("Non-Deferred Uniqueness Constraints", PostgreSQL's `CREATE TABLE` docs). A partial unique index can't be deferred. So an `is_default` flag with a unique index can fail an update that moves the flag from one bot to another in a single statement.

### fxbot today

- **Launch.** The app reads the bots once at launch (`client.profiles.list()`, `packages/ui/src/app.tsx:65-89`). It stays laid out but hidden until its first screen is whole: the bots, and on a chat its messages (`app.tsx:108-122`).
- **`/` is Home,** "Pick a bot" (`app.tsx:124`, `Home` at `app.tsx:367`).
- **The app goes to `/` itself** after a bot is deleted (`app.tsx:438`), and the chat-rooms plugin does after a room is deleted (`plugins/chat-rooms/fxbot/page.jsx:174`).
- **Each bot has one lasting chat,** `profile.sessionId`. `/profiles/<id>` opens it at its end (`Chat`, `app.tsx:586`). A provider switch, and [/fresh](../../phases/fresh.md), move a bot to a new session, and the chat follows.
- **Pins are on the bot** (`profiles.pinned_at`, `packages/sdk/src/migrations/0001_baseline.sql:54-58`). The sidebar has no menu on a bot, only Pin and Unpin buttons (`app.tsx:211-279`).
- **The settings table is one row:** `check (id = 1)`, with `default_provider` and `unvetted` (`0001_baseline.sql:1`, `0007_one_kind_of_plugin.sql:11`). Its store calls are `packages/sdk/src/store.ts:71-83`.
- **`PATCH /api/settings`** passes its fields to the SDK as they are (`packages/server/src/index.ts:184-195`).

## 2. Key takeaways

1. **Two models.** Some products have an explicit default (Grok's primary Bot, OpenDuet's product Bot, OpenDots' oldest Dot). Others open whatever was used last (the OpenMuse skin and p2). The owner chose the explicit kind, which is simpler and the same on every device.
2. **One assistant means one ongoing chat.** Products built around one assistant open on its ongoing chat, not a new one (OpenDuet, openmuse, Grok's first run). fxbot's bots each have one lasting chat, so "the default's ongoing chat" is just `/profiles/<id>`.
3. **Only a fresh launch at `/`.** p2 skips a reload and Back, and a link opens its own address. fxbot can do the same from the page load's navigation type, with no stored state.
4. **Replace, don't push.** p2 picks the route before it renders, and fx0 replaces the address. So Back leaves the app instead of landing on Home.
5. **No flash and no extra request** (OpenDuet's comment). The bot list fxbot already reads at launch can say which bot is the default. The app is hidden until its first screen is whole, so swapping the address in the same update as the list means Home never paints.
6. **Store it once.** A column on the one-row settings table makes "at most one default" structural, with no unique index and no race. `on delete set null` clears it when the bot goes. It sits beside `default_provider`, the setting it's most like.
7. **Pick it where settings are.** Grok sets it from a menu in the sidebar, but fxbot's sidebar has no menu on a bot, only Pin. A select in Settings › General is the smallest place.

## 3. Implementation

### Where the owner picks it

**Settings › General** ([settings tabs](settings-tabs.md)) gets one row:
- **Default bot,** a `NativeSelect` with **None**, then each bot by name, in the sidebar's order.
- Under it: "fxbot opens to this bot's chat when it starts at its address."
- **A change saves at once,** with `client.settings.update({ defaultProfile })`. A failure shows in General's error line.

`SettingsScreen` takes the app's bot list as a prop, `profiles`, as `LibraryPage` does. If settings tabs isn't built yet, the row goes at the top of `SettingsForm`.

### Stored once

`packages/sdk/src/migrations/0008_default_bot.sql`. If another 0.5.0 phase takes 0008 first, use the next free number.

```sql
-- A default bot (docs/phases/default-bot.md): the bot whose chat a launch at / opens. Deleting the bot clears it.
alter table settings add column default_profile text references profiles on delete set null;
```

### The API

**`packages/sdk/src/types.ts`:**
- `Settings` gains `defaultProfile: string`: a bot's id, or `""` for none.
- `Profile` gains `isDefault: boolean`, read-only.

**`packages/sdk/src/store.ts`:**
- **The bot's columns** (`store.ts:37`) gain `exists (select 1 from settings where default_profile = profiles.id) as is_default`. Every list, get, create, and update then returns `isDefault`, so the list the app reads at launch carries it.
- **`settings.get`** selects `default_profile` and returns `defaultProfile: row?.defaultProfile ?? ""`.
- **`settings.save`** takes `defaultProfile`, and stores `""` as `null`. It's one upsert, as today.

**`packages/sdk/src/index.ts`,** in `settings.update`:

```ts
if (input.defaultProfile !== undefined) {
  if (typeof input.defaultProfile !== "string") fail(400, "defaultProfile must be a string");
  // 400 for an id that isn't one, 404 for no such bot.
  if (input.defaultProfile) await get(input.defaultProfile);
  await store.settings.save({ defaultProfile: input.defaultProfile });
}
```

**The server and the client** change nothing. `PATCH /api/settings` already passes `defaultProfile` through, and the client's types come from the SDK.

### The launch

In `App` (`packages/ui/src/app.tsx`), the first successful read of the bots does the work:

```ts
// A launch at / opens the default bot's chat (docs/phases/default-bot.md): a fresh load only, not a reload or Back,
// and only until the first list arrives, so / later in the visit is Home.
const launch = useRef(location.pathname === "/" && ["navigate", undefined].includes((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type));
…
(list) => {
  if (stopped) return;
  const start = launch.current && location.pathname === "/" && list.find((p) => p.isDefault);
  launch.current = false;
  // Replaced, so Back leaves the app. Set with the list, so Home never paints: the chat holds the paint until it's whole.
  if (start) history.replaceState(null, "", `/profiles/${start.id}`), setPath(location.pathname);
  setProfiles(list);
  setOffline(false);
}
```

- **What counts as a launch:**
  - Opening fxbot at `/`: the installed app's icon, or the address typed in a browser tab.
  - A reload or Back/Forward at `/` doesn't count, so the owner on Home who taps **Reload** for a new build stays on Home.
  - A browser without navigation timing counts as a fresh load.
- **Links** to any other address (`/settings`, `/profiles/<id>/edit`, `/library`, a plugin's screen) open that address, since the check needs `/`.
- **Later in the visit,** going to `/`, as after deleting a bot, shows Home.
- **Offline at launch,** Home shows with the offline line. When the list arrives, the app opens the default's chat if the owner is still on `/`.
- **It costs nothing extra:** no new request, no wait, and about 10 lines in the page.
- **What opens is the bot's chat as it is,** whatever session it's on, at its end. A bot with no provider shows its "has no provider" screen, as today.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/migrations/0008_default_bot.sql` | `settings.default_profile`, cleared when the bot is deleted | 2 |
| `packages/sdk/src/types.ts` | `Settings.defaultProfile`; `Profile.isDefault` | 3 |
| `packages/sdk/src/store.ts` | `is_default` in the bot's columns; settings read and save the field | about 5 |
| `packages/sdk/src/index.ts` | `settings.update` checks `defaultProfile` | about 6 |
| `packages/server` | Nothing | 0 |
| `packages/ui/src/app.tsx` | The launch; `profiles` passed to `SettingsScreen` | about 10 |
| `packages/ui/src/settings.tsx` | General's **Default bot** | about 15 |
| Website | `sdk/reference/server-api.md` and `http-api.md`: `defaultProfile` and `isDefault`. `docs/explanation/bots-and-chats.md`: the default bot. | about 12 |
| `CHANGELOG.md` | The line, and the migration under **Before upgrading** | about 3 |

Size: about 40 lines of code and one migration, plus about 15 lines of docs. It adds no request and no package. Launch does no more work than before: one more column on the list it already reads.

### Not in this phase

- **Opening the last-used bot** instead of a chosen one (the OpenMuse skin, p2).
- **A room or a plugin's screen as the default.** The default is a bot.
- **Other places to pick it:** a mark on the default in the sidebar, **Make default** in a bot's settings, or a menu on a bot's row.
- **A different default on each device.**
- **A new session on launch.** The owner chose the ongoing chat.
- **Other uses of the default,** such as where a message with no bot goes, as Grok's main Bot takes posts tagged on X.

## 4. Checklist

Checks run against a disposable Postgres and `FXBOT_DATA`, on another `FXBOT_PORT`, with the mock model. Playwright runs at 1280×800 and 375×667. Don't start a server on the owner's dev port. [Settings tabs](settings-tabs.md) is built first; if it isn't, the select goes at the top of `SettingsForm`.

**M1. Store and API**
- [x] On a scratch database that 0.4.1 made, the server backs up, runs `0008_default_bot`, and starts. `\d settings` shows `default_profile` referencing `profiles(id)` `on delete set null`.
- [x] `PATCH /api/settings` with `{"defaultProfile":"<id>"}` answers with that id. `GET /api/profiles` shows `isDefault: true` on that bot only.
- [x] Making another bot the default moves `isDefault` to it.
- [x] `""` clears it. An unknown 12-hex id gets 404, `"x"` gets 400, and `5` gets 400.
- [x] `DELETE /api/profiles/<id>` of the default leaves `defaultProfile: ""`, and no bot has `isDefault`.
- [x] Creating, renaming, and pinning a bot each return `isDefault` correctly.

**M2. Launch**
- [x] With a default, a new tab at `/` lands on `/profiles/<id>`, scrolled to the chat's end. Back from there leaves the app: `history.length` is the same as when the chat is opened directly (2 in Playwright, whose new page starts with a blank entry), so the address was replaced, not pushed.
- [x] "Pick a bot" is never visible on that load. An init script in Playwright watches for it from the start of the load and never sees it.
- [x] The `/api` requests on that load are the same as opening the chat directly: the chat's own, and no settings read.
- [x] With no default, `/` shows Home as today.
- [x] `/settings`, `/library`, and `/profiles/<other>/edit`, each opened in a new tab, open that screen.
- [x] Deleting a bot goes to `/` and shows Home, not the default. A reload there stays on Home.
- [x] Offline at launch, then back: the app opens the default's chat once the list loads, if still on `/`.
- [ ] The installed app (Playwright's Chromium with the app installed, or by hand) opens on the default's chat. Left for the owner: the phone checks below cover it.

**M3. Settings › General**
- [x] **Default bot** lists **None** and every bot. A pick saves (`GET /api/settings` shows it) and survives a reload.
- [x] After the default bot is deleted, the select shows **None**.
- [x] At 375 px wide, the select fits the column.

**M4. Docs and checks**
- [x] `packages/website/src/content/docs/sdk/reference/server-api.md`:
  - `Settings` has `defaultProfile`, and `Profile` has `isDefault`, the bot a launch at `/` opens.
  - A line says `defaultProfile` takes a bot's id or `""`, an unknown id fails with 404, and deleting the bot clears it.
- [x] `sdk/reference/http-api.md`: `PATCH /api/settings` lists `defaultProfile`.
- [x] `docs/explanation/bots-and-chats.md` gets a short section, "The default bot": picked in Settings › General; opening fxbot at its address opens that bot's chat where it left off; a link to another screen opens that screen, and a reload stays where it was.
- [x] `CHANGELOG.md`, under `## Unreleased`:
  - "**A default bot.** Pick one in Settings › General, and launching fxbot opens its chat, where it left off."
  - Under **Before upgrading**: "Migration `0008_default_bot` adds a `default_profile` column to `settings`."
- [x] `npm run typecheck`, `npm run build`, and `npm run build-site` pass.
- [x] `git diff --check` passes, and the new migration file has no trailing whitespace.
- [x] One commit on `release/0.5.0` says what changed. Not pushed.

**Bounds.** About 40 lines of code and one migration. Stop and ask if it needs a server route, a new request at launch, a second migration, or more than 80 lines of code. Out of scope: [Not in this phase](#not-in-this-phase).

**The human checks these by hand:**
- On iPhone and Android, with the installed app:
  - Set a default, close the app fully, and open it from its icon. It opens on that bot's chat, at its end, with no flash of Home.
  - Then reload from the sidebar's **New version** row while on Home, and see Home stay. iOS may reopen an installed app at the last address rather than at `/`, and whether its navigation timing reads `navigate` on a launch is unverified. If it doesn't, note what it does.
- With a default set, open a link to another screen, such as `/settings`, from outside the app, and see that screen.

## What the build changed

- **The launch's checks compare with opening the chat directly.** In Playwright, a new page's history starts with a blank entry, so `history.length` is 2 either way. The launch at `/` and a direct open of the chat give the same length and the same `/api` requests, which is what the plan meant: the address is replaced, and the launch adds no request. Both read `GET /api/profiles` twice, since the list is read again when a chat's finished turns are counted.
- **Where it's picked.** Only Settings › General, as planned. The select lists the bots in the sidebar's order, under **None**.
- **Size:** the migration's 3 lines, and 36 more lines than before across the SDK and the page, under the 40 planned.
- **Checks** ran against a disposable Postgres that 0.4.1's migrations made, which backed up and ran `0008_default_bot`, with bots on the echo mock model and Playwright at 1280×800 and 375×667. Offline at launch was a failed first `GET /api/profiles`.

## 5. Open questions

1. **Should the first bot become the default,** as it starts pinned?
   - *Default:* no. Nothing changes until the owner picks one, so a new owner with one bot still opens on "Pick a bot".
   - Grok's first run opens a chat with its first Bot. Yes would be one more line in `profiles.create`, and the migration would make the oldest bot the default on existing installs too.
