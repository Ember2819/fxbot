# Onboarding

A new owner gets from an empty install to a bot that's ready, in a few screens:
- **Essentials.** A short pack of the plugins that make fxbot great, added in one go. It sits at the top of **Browse** too, for later.
- **Essentials or your own.** The first screen shows what's in the pack, and offers **Choose my own**, with the pack already ticked.
- **Your first bot.** Connect a provider, then name your bot.
- **Where plugins live.** One short screen says how to add more, then opens the bot's chat.
- **Nothing to get stuck in.** Each step saves where you are, so a restart picks up there, **Skip for now** is always there, and owners who already use fxbot never see it.

Status: planned on 2026-11-06, at the owner's word. Researched against the research directive's references, and Grok Bot, OpenClaw, Hermes Agent, Home Assistant, VS Code, JetBrains, WordPress, and Obsidian. Not built. It's for 0.7.0.

## What the owner asked

"ok I want plugins page to have listed at the top an "essentials" pack that includes all the plugins that we think make a great experience."

"Then when folks first setup fxbot they are ran through an onboarding flow:"

1. "Essentials setup or custom?"
2. "If essentials install all the essentials plugin"
3. "if custom send them to next screen to pick their plugins to install" (2b)
4. "Setup their first bot"
5. "Tell them how to add new plugins in the future"

## 0. Core or plugin

**Core** ([Core or plugin](../../CONVENTIONS.md#core-or-plugin)). It runs before any plugin exists, and "finding, vetting, adding, and updating plugins" are core. Which plugins are in the pack is data, in fxbot's list, so core never names one.

## 1. Research

Read on 2026-11-06. The references are from source, in clones made on 2026-11-04: OpenBot at `c40def5`, Pi at `04f672a`, fx at `5245be4`, and eve at `3b69045`. The rest are from their docs and source on the web. The quotes that matter were checked again against the original.

**No reference has a recommended pack, or an "essentials or custom" choice.** Searched for onboarding, wizard, first run, setup, init, recommended, starter, template, bundle, and pack.

### The directive's references

**OpenBot:** the most to learn from.
- **Web:** "THREE CLICKS AT MOST INTO THE APP" (`app/src/routes/_authed/onboarding.tsx`). Welcome, with one live switch, then a name. No model step.
- **Its state is the part to copy.** "A null `completedAt` is what gates the app into /onboarding." (`server/src/people/onboarding.ts`) Each move saves a stable step: a "number per id, never a position in the list".
- **Owners already there:** "anyone here when the column arrives is stamped as done" (`server/drizzle/0025_backfill_existing_users_have_onboarded.sql`).
- **Desktop:** "OpenBot sets this up for you.", with the choices behind a disclosure, and it ends by asking the bot something: "this screen exists to prove rather than to reassure" (`desktop/src/Ask.tsx`).
- **What's left over** waits in Settings: "READY MEANS IT WORKS, NOT THAT SOMETHING IS SET." (`server/src/setup/checklist.ts`)
- **Too much at once backfired:** sample Bots stopped loading by default, "which put a dozen Bots in front of every new deployment at once".

**OpenDuet:** OpenBot's, longer. "Not now writes nothing; the checklist after them says what was left."

**OpenDots:** no wizard, nothing stored. Readiness is derived, and until then the chat says "Your first conversation starts after setup."

**openmuse:** no wizard. "Welcome to OpenMuse."

**Pi:** new means "setup was not completed before (settings.json does not exist)". It picks a theme, and the model comes after, by `/login`. Packages "install and distribute extensions, skills, prompt templates, and themes as one unit", with no recommended set.

**fx:** with no credential, a picker: "Choose a sign-in option below, or add your own API key." and "esc to set up later".

**eve:** "eve connects with credentials you already have, or opens `/login` to set one up." Setup steps "Must be idempotent" (`packages/eve/src/setup/step.ts`).

**fx0:** "Type a message before you sign in." **agent-browser**, **agent-desktop:** only a first-run note. **durable-harness:** nothing.

**Grok Bot** ([get started](https://docs.x.ai/grok-bot/get-started)): sign in, a brief introduction, then "Grok Bot then sets up your first Bot, named Grok Bot, and opens a chat with it." No pack and no choice. Apps come later.

### Other systems

**OpenClaw** ([wizard](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/start/wizard.md)): the closest to the owner's flow. "Fresh local interactive onboarding offers **Quick start** and **Custom setup**". It names the agent, asks full access or ask first, finds AI access, tests it live, and opens the dashboard. It "installs recommended skills and their optional dependencies". **Skip for now** exits, and it can run again. 2026.8.1 "verifies the chosen model before saving it".

**Hermes Agent** ([quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart)): Quick Setup, Full Setup, and Blank Slate. The provider is "The single most important setup step." It later thinned to "two clear paths", because "a brand-new user shouldn't need to read docs", and added "Choose provider later". It decides someone is new from no provider being found, and that was reported misfiring on working keys.

**Home Assistant:** a short flow with no plugin step. `default_config` is a bundle of 21 integrations written silently into new configs. The price of a block: to drop one, you "manually add every other included integration". Its onboarding keeps a stored list of steps done, and migrations mark later steps done for old installs.

**VS Code:** an extension pack is "a set of extensions that will be installed together", whose members stay "manageable independent of the pack". The guidelines warn against "an excessive number of steps".

**JetBrains:** a first-run wizard with "Default plugins", "Featured plugins", and "Skip Remaining and Set Defaults". It was removed in the 2020.3 EAP, and customizing moved to the Welcome screen. No reason was found.

**WordPress:** no pack, and a plugin screen with Featured, Popular, and Recommended tabs. Bundled Hello Dolly drew years of complaints about "always having to deactivate and delete it".

**Obsidian:** "Create new vault" or "Open folder as vault". Community plugins are off until the person turns them on.

**Published guidance.** Microsoft's [setup guide](https://learn.microsoft.com/en-us/windows/win32/uxguide/exper-setup), written for Windows 7, on a typical or custom page:
- "Prefer to eliminate this page."
- If you keep it, "Explain the differences among options", and "If users choose custom options, have the typical installation options selected by default."
- "consider using relative button sizing and placement to guide most users to the typical installation."
- "Allow users to restart the setup program where they left off".
- "Advance pages automatically when a page has no input and the task is done successfully".
- "For the final input page, label the commit button Install, not Next."
- "start the program automatically when setup is done, instead of showing a Congratulations or Completion page", though "If the setup has follow-up steps after installation, list them".

[NN/g](https://www.nngroup.com/articles/mobile-tutorials/) tested tutorials with 70 people: 91% success having read one, and 94% having skipped it, not significant. "Think twice about creating a tutorial for simple applications." Nobody publishes a study of express against custom for a consumer app.

### fxbot today

Read from the code on 2026-11-06.

- **There's no onboarding.** A new install shows **No bots yet**, and the tutorial sends the owner to **Settings** › **Providers**, then **New bot**.
- **A bot needs a provider.** `create` reads the default one, and a chat with none says "No provider yet". So the owner's step 3 has a part in front of it.
- **Adding plugins already works from the page.** `client.plugins.preview` then `client.plugins.add`. fxbot's plugins are in one repository, and `archives.files` keeps a commit's files for 5 minutes, so several adds read GitHub once.
- **An add can be refused,** by a plugin that needs another first, or by [compatibility](../_completed/phases/plugin-compatibility.md). `chat-rooms-computer` needs `computer` and `chat-rooms`, so order matters.
- **`computer` reaches outside the app.** On **Add**, in a release install, it asks the machine to run a setup script as root, which makes a user, a rootless engine, and a firewall, then restarts fxbot's container ([the computer on Add](../_completed/phases/computer-on-add.md)). The add returns first, and the restart comes later. So it could land during a later step, and a sign-in in progress lives in memory.
- **`settings` is one row,** with room for a column or two. It's the natural home for this.
- **`plugins-registry.json`** is shipped and read hourly from fxbot.sh, as `{ plugins: [...] }`, so a new top-level key is ignored by older installs.
- **`Providers`** is a whole component, exported, with its add and sign-in dialogs. It can go in a step as it is.
- **`NewBot`** is a dialog in `app.tsx`, so its form needs pulling out to share.
- **Plugins cost something,** each in its own way: `permissions` adds a review to risky calls, `dreams` runs each night, and each plugin's tools ride in every request.

## 2. Key takeaways

1. **Ask little, then go.** Every source agrees, from OpenBot's "THREE CLICKS AT MOST" to Microsoft's "be ruthless". The owner's flow is a good size: one choice, one bot, one line of teaching.
2. **The owner's choice screen goes against one piece of advice, and that's fine.** Microsoft says "Prefer to eliminate this page", and Grok, Home Assistant, and Obsidian have none. OpenClaw and Hermes, the two closest products, both keep it, and Hermes went from more paths to fewer. Here the choice carries real weight: plugins run code, and `computer` touches the machine. So it stays, as the owner asked, and it does real work: it shows what's in the pack, with Essentials as the big button.
3. **Custom starts from the pack.** "have the typical installation options selected by default." Untick what you don't want.
4. **The pack is a shortcut, not a block.** Home Assistant's `default_config` is the warning, and VS Code's pack the model: each plugin stays its own, and can be removed like any other.
5. **Keep it short, or it goes stale.** Hello Dolly and OpenBot's dozen Bots are what too much looks like. A plugin earns a place by being wanted by most owners, on most days.
6. **Store a stable step, and stamp old owners.** OpenBot's design, and Home Assistant's. It survives a restart, it works from a second device, and nobody who already uses fxbot sees it.
7. **Don't key "new" to one thing.** Hermes' check misfired. A stored date, with bots as a backstop, can't.
8. **The provider comes before the bot.** Hermes calls it "The single most important setup step." fxbot can't make a bot without one. OpenClaw's live check is the right instinct, and the provider's own sign-in and key check already give it.
9. **End in the product.** Microsoft and OpenBot agree: the chat is the proof. The last screen's button opens it.
10. **Keep the teaching to a screen.** NN/g found no benefit from tutorials, and the owner asked for this, so it's one sentence and a picture of where to look, on the way to the chat.
11. **Put what reaches the machine last.** `computer` restarts fxbot at some point after its **Add**. Going last, it can't stop the others, and a saved step means the restart costs nothing but a moment.

## 3. Implementation

### What changes from the ask

| The ask | This plan | Why |
| --- | --- | --- |
| "Setup their first bot" | Connect a provider if there's none, then the bot | A bot can't be made without one |
| Four steps | The same, with **Skip for now** on each | Nobody should be trapped in a wizard |
| Tell them about plugins | One short screen, ending at the chat | NN/g, Microsoft, and OpenBot |

### The pack

One new key in `plugins-registry.json`, in the order they're added:

```json
{
  "essentials": ["permissions", "fresh", "routines", "dreams", "messages", "chat-rooms", "computer"],
  "plugins": [ ... ]
}
```

- **It's data.** It ships with a release, and the published list replaces it hourly, so the pack can change with no release. Core never names a plugin.
- **The order is the install order.** A plugin that needs another comes after it, and whatever reaches the machine comes last.
- **Only plugins from fxbot's list.** A name that isn't on the list is left out.
- **An install that's older ignores it.**

`registry.ts` keeps it beside the plugins list, and `PackageSearch` gets `essentials: string[]`, so **Browse** has it with no new route.

### Adding several

One component, `AddPlugins`, in `packages/ui/src/add-plugins.tsx`, used by onboarding and by **Browse**. It takes a list of cards, and adds them in order, one at a time, with `client.plugins.preview` then `client.plugins.add`:

```text
✓  permissions
✓  fresh
⟳  routines
·  dreams
✕  messages     It needs fxbot 0.8.0 or newer. This is 0.7.0.
```

- **One that fails doesn't stop the rest.** It shows why, with **Try again**.
- **One already added is passed over,** so **Try again**, a reload, and a second run are all safe, as eve says of setup: "Must be idempotent".
- **There's no new server route.** The page already makes these calls.
- **The plugin's own rules still hold.** A plugin [compatibility](../_completed/phases/plugin-compatibility.md) refuses is shown, and passed by.

### At the top of Browse

```text
┌──────────────────────────────────────────────────────────┐
│ ◉◉◉◉  Essentials                                         │
│       What most people want from fxbot. 5 of 7 added.    │
│       [ Add the other 2 ]              [ What's in it ]  │
└──────────────────────────────────────────────────────────┘
```

- **It's first on Browse,** above fxbot's picks, with each plugin's icon.
- **What's in it** opens the list, each with its description and a link to its page, where its code can be read.
- **With all of them added,** it says so, and has no button.
- **The plugins still show below it,** as they do now, so they can be added one by one.

### The flow

A screen at `/`, while onboarding is open:

```text
choose ──► adding ──► provider ──► bot ──► plugins ──► the bot's chat
   │         ▲       (if none)
   └► custom ┘
```

**`choose`**

```text
Set up fxbot

  ┌─────────────────────────────────────────────┐
  │ Essentials                     Recommended  │
  │ What most people want. You can change it.   │
  │  ◉ permissions  Decide what each bot can…   │
  │  ◉ routines     Bots run saved tasks…       │
  │  ◉ computer     A Linux computer for each…  │
  │  …                                          │
  │  [ Set up Essentials ]                      │
  └─────────────────────────────────────────────┘
  Choose my own                 Skip for now
```

- Each plugin's line is the description from the list, so it says what the owner gets.
- **computer** has a line of its own: "Sets up a computer engine on this machine, then restarts fxbot." That's a thing an owner should know before saying yes.

**`custom`:** each plugin on fxbot's list, with a checkbox, and the pack ticked. Ticking one that needs another ticks that too, and the button says what it'll do: **Add 5 plugins**. With nothing ticked, it says **Continue**.

**`adding`:** `AddPlugins`. It moves on by itself when all went well, and stays when one failed, with **Try again** and **Continue**.

**`provider`:** shown only if there's no provider. It's `Providers` from Settings, as it is, and **Continue** turns on once there's one.

**`bot`:** the form from `NewBot`, pulled out as `BotForm`, with the look picker, and the blob watching. It says **Create**.

**`plugins`:**

```text
Scout is ready.

More plugins are under Plugins, at the foot of the sidebar.
Essentials stays at the top of Browse.

[ Start chatting ]
```

**Start chatting** finishes onboarding, and opens the bot's chat.

### Remembering

`0011_onboarding.sql`:

```sql
alter table settings add column onboarding_step text;
alter table settings add column onboarded_at timestamptz;
-- Anyone already using fxbot is done.
insert into settings (id) values (1) on conflict (id) do nothing;
update settings set onboarded_at = now() where exists (select 1 from profiles) or exists (select 1 from plugins) or exists (select 1 from providers);
```

- **`onboarded_at`** null means the flow is open. `Settings` gets `onboarded: boolean` and `onboardingStep: string`.
- **Each step saves its id,** a word and not a position, with `PATCH /api/settings`, so steps can be added later.
- **A restart comes back to the same step.** So does a second device.
- **`adding` is safe to come back to,** since what's added is passed over.
- **A bot made some other way ends it,** so an agent or the API can't leave an owner in a wizard: the flow shows only with `onboarded_at` null and no bots.
- **Skip for now** sets `onboarded_at`. There's nothing to undo: **Browse** and **New bot** are right there.

### The app

- **`/`** shows `Onboarding` in place of `Home` while it's open. Other paths work as they do, so **Settings** and a link from a doc still open.
- **The sidebar stays,** so the last screen can point at what's really there.
- **It's a page in the app, not a modal,** with a width like a chat's, and it fits at 375 pixels.

### When things go wrong

| What happens | What the owner sees |
| --- | --- |
| GitHub can't be reached | That plugin fails, with **Try again** and **Continue** |
| A plugin won't add | Why, and the rest carry on |
| fxbot restarts during the flow | The app's own "Retrying", then the same step |
| `computer`'s setup fails | Nothing here: its tab says why, with **Try again**, as today |
| A sign-in is cut off by that restart | The sign-in fails, and **Add provider…** starts it again |
| The provider's sign-in fails | What `Providers` says today |
| The page closes on `adding` | It comes back, and adds the rest |

### The site and the docs

- **fxbot.sh's plugin directory** shows Essentials at the top, from the same list.
- **"Your first fxbot"** walks the new flow, in place of **Add a provider** and **Make a bot**.
- **`agent-setup.txt`** hands the person to the app after install, for the flow.
- **The how-to for adding a plugin** says what Essentials is.
- **Add a provider** stays as it is, for later.

### Cost

- **Idle:** nothing. One key more in a list that's read already, and one more value in `settings`.
- **A finished install:** one boolean read with the settings the app reads anyway.
- **In the page:** a few KB for the flow.
- **The pack itself** costs what its plugins cost. The list's descriptions say what they do, and each plugin's README says what it costs. `dreams` and a reviewer in `auto` spend tokens, so an owner on a tight budget has **Choose my own**.

### Not in this phase

- **Running setup again.** **Browse** has what it would offer.
- **Other packs,** such as one for developers. The key could become a list of packs.
- **Skills or MCP servers in the pack.** MCP servers want sign-ins, so they'd add steps.
- **A checklist in Settings of what's left,** OpenBot's. An install with no bots already shows **New bot**.
- **A first message for the bot,** OpenBot's "Ask it something." The chat is open and empty, which is enough to start.
- **Setting up from the command line.** `setup.sh` ends at the app.
- **Templates for bots,** such as a research bot. It's a separate idea.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/migrations/0011_onboarding.sql` | Two columns, and stamping owners already here | 5 |
| `packages/sdk/src/store.ts`, `index.ts`, `types.ts` | The two settings | about 15 |
| `packages/sdk/src/registry.ts`, `plugins-registry.json` | The pack | about 12 |
| `packages/ui/src/add-plugins.tsx` | Adding several, with what happened to each | about 70 |
| `packages/ui/src/onboarding.tsx` | The screens | about 170 |
| `packages/ui/src/app.tsx` | `BotForm` out of `NewBot`, and the flow at `/` | about 15 |
| `packages/ui/src/plugins-page.tsx` | Essentials at the top of Browse | about 30 |
| `packages/website/src/plugins.ts`, its page | Essentials in the directory | about 15 |
| Website, `README.md`, `CHANGELOG.md`, `public/agent-setup.txt` | The tutorial, the how-to, and the changelog | about 50 |

Size: about 320 core lines, plus about 65 of site and docs.

## 4. Checklist

Checks use the harness the last phases used: a disposable Postgres, a check server on another port, the mock model, a stubbed GitHub and fxbot.sh, and Playwright at desktop and phone widths, with writes blocked on any real install. A fresh install is a fresh database, with no `FXBOT_PLUGIN_DIRS`. `computer`'s real setup is a human check: here the stub stands in for it.

Print a check's setup, and match exact fields: one that tested nothing can't pass.

**The bound:**
- **Size:** at most 380 core lines.
- **Out of scope:** [Not in this phase](#not-in-this-phase).
- **If it must be cut,** the directory's section goes first, then **What's in it** on Browse. The pack, the flow, and resuming stay.

**M1. The pack**
- [ ] `essentials` in `plugins-registry.json` reaches `PackageSearch`, in order, and a name not on the list is left out.
- [ ] The published list replaces it hourly, and with the site down, the shipped copy holds.
- [ ] An older reader of the file still gets its `plugins`.
- [ ] No plugin's name is in core's code.
- [ ] `npm run typecheck` passes.

**M2. Adding several**
- [ ] `AddPlugins` adds a list in order, and shows each as it goes.
- [ ] One that fails shows why, and the rest carry on.
- [ ] **Try again** adds only what's left.
- [ ] One already added is passed over, with no error.
- [ ] A plugin that needs a newer fxbot shows it, and is passed by.
- [ ] A plugin whose needs come after it in the list fails with a reason, not a crash.

**M3. Browse**
- [ ] Essentials is first on **Browse**, with each plugin's icon and how many are added.
- [ ] **Add the other 2** adds only those.
- [ ] With all added, it says so, with no button.
- [ ] **What's in it** lists each with its description, and links to its page.
- [ ] Each plugin stays its own: removing one leaves the rest, and the count drops.
- [ ] At 375 pixels there's no sideways scroll.

**M4. Remembering**
- [ ] `0011_onboarding.sql` stamps an install with a bot, a plugin, or a provider, and leaves an empty one.
- [ ] Moving a step saves its id.
- [ ] A restart at each step comes back to it.
- [ ] A second browser opens at the same step.
- [ ] **Skip for now** on each step ends it, and it doesn't come back.
- [ ] A bot made through the API ends it.
- [ ] An upgraded install with bots never sees it. Check on a database made by 0.6.0.

**M5. The flow**
- [ ] A fresh install's `/` shows **Set up fxbot**, with the pack's plugins and their descriptions, and `computer`'s line.
- [ ] **Set up Essentials** adds them in order, and moves on by itself.
- [ ] A failure stays on the screen, with **Try again** and **Continue**.
- [ ] **Choose my own** lists fxbot's plugins, with the pack ticked. Unticking leaves it out, and the button counts.
- [ ] Ticking a plugin ticks what it needs.
- [ ] With nothing ticked, it goes on with no plugins.
- [ ] With no provider, `provider` shows, and **Continue** is off until there's one. With one already, the step is passed.
- [ ] `bot` makes a bot, on the default provider, with its look.
- [ ] The last screen names the bot and says where plugins are, and **Start chatting** opens its chat, and the bot answers. Assert on what the mock got.
- [ ] `/settings` and `/plugins` still open while the flow is open.
- [ ] A restart during `adding`, as `computer` causes, comes back and finishes.
- [ ] At 375 pixels there's no sideways scroll, and the page logs no errors. Load 5173 as well as the build, with writes blocked.

**M6. Docs and checks**
- [ ] fxbot.sh's directory shows Essentials at the top.
- [ ] **The website:** "Your first fxbot" walks the new flow, and the how-to for adding a plugin says what Essentials is.
- [ ] `agent-setup.txt` hands the person to the flow.
- [ ] `CHANGELOG.md`, under `## Unreleased`: the flow, the pack, and migration `0011_onboarding` under **Before upgrading**.
- [ ] `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass. New files are checked for whitespace too.
- [ ] The line counts are within the bound.
- [ ] This doc's Status says built, with what the build changed. It moves to `docs/_completed/phases/`, and `AGENTS.md` lists it.
- [ ] The work is committed on the open release branch, core and docs in separate commits, and not pushed.

**The human runs these:**
- **A real first run:** a fresh release install on a machine that's never had fxbot. Does `computer`'s setup, and its restart, feel fine in the middle of it?
- **On a phone:** the whole flow.
- **The words:** does the first screen tell you enough to choose?
- **After a week:** would you change what's in the pack?

## 5. Open questions

**Left,** with a default the build follows unless the owner changes it:

1. **What's in Essentials?** *Default:* `permissions`, `fresh`, `routines`, `dreams`, `messages`, `chat-rooms`, and `computer`, which is every plugin but `chat-rooms-computer`. That's a lot of a short list, and the sources warn a pack goes stale when it's too big. `messages` and `chat-rooms` do nothing with one bot, and `dreams` costs tokens each night. A tighter pack would be `permissions`, `computer`, `routines`, and `fresh`.
2. **Should `computer` be in it?** *Default:* yes, added last, with its own line on the first screen. It's what lets a bot do real work, and it's also the one plugin that runs a root script, makes a user, sets a firewall, and restarts fxbot, which is a lot to do from one button on a first screen, and it may not suit a small machine. The other way: leave it out of the pack, and offer it on the last screen.
3. **A separate "Essentials or custom?" screen.** *Default:* keep it, as asked, with Essentials as the big choice. Microsoft's guide says to drop such a page, and Grok, Home Assistant, and Obsidian have none. The smaller way: one button, **Set up Essentials**, with **Choose my own** as a link, which is nearly what the sketch shows.
4. **Is the pack at the top of Browse only, or above Installed too?** *Default:* Browse, since that's where plugins are added, and an owner with everything added doesn't need it.
