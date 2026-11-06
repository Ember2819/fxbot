# Plugin compatibility

fxbot knows which plugins can run on it, before they run:
- **A floor, in the plugin.** `minFxbot` in `plugin.json` is the oldest fxbot a plugin runs on. A plugin that needs a newer fxbot can't be added, or updated to, and says why.
- **What a release broke, in fxbot.** A short list names what each release took out of the plugin API. A plugin whose code still uses one is **Unsupported**: it doesn't run, it says why, and everything else carries on.
- **Before it happens.** That list is published, so Settings can say which plugins an update would stop, before the owner clicks **Update**.
- **No ceiling.** A plugin never says the newest fxbot it runs on. An author can't know that, and Firefox and JetBrains both backed away from asking.

Status: built on 2026-11-06, for 0.7.0, as planned the same day at the owner's word. Researched against the research directive's references, and Obsidian, VS Code, Firefox, Chrome, JetBrains, WordPress, Home Assistant, Grafana, OpenClaw, Hermes Agent, and Claude Code. Where the build differs from the plan, [What the build changed](#what-the-build-changed) says so.

## What the owner asked

"one thing if doesn't exist already plugins need a minimum version compatability rule. and we need to know if something used in a plugin is broken later release so we can show "unsupported" and people don't bork their bots by installing an old plugin or a new plugin that requires a newer version fxbot."

So there are two cases:
- **Too new:** a plugin needs a newer fxbot than this one.
- **Too old:** a later fxbot broke something the plugin uses.

## 0. Core or plugin

**Core** ([Core or plugin](../../../CONVENTIONS.md#core-or-plugin)). The conventions name "finding, vetting, adding, and updating plugins, and the plugin API" as core, and a plugin can't guard the door it comes in through. No plugin changes. fxbot's own plugins each gain one line in `plugin.json`.

## 1. Research

Read on 2026-11-06. The references are from source, in clones made on 2026-11-04: eve at `3b69045`, Pi at `04f672a`, openbot at `c40def5`, and fx at `5245be4`. The rest are from their docs and source on the web. The quotes that matter were checked again against the original.

### The directive's references

**eve** (`packages/eve/src/compiler/extension-compatibility.ts`): the closest to this plan.
- **Too new:** `eve extension build` stamps `builtWithEve`, "Minimum compatible eve release: the version used to build the extension." An author doesn't write it.
- **Too old:** `SUPPORTED_EXTENSION_DISTRIBUTION_CONTRACT_MAJORS: readonly number[] = [0]`. An extension carries an integer `contractMajor`, and eve lists the ones it still takes. "Generations are independent of eve versions" (`CONTRIBUTING.md`).
- **It's checked first:** "before it loads the extension's code", during discovery.
- **What it says:** `Upgrade eve to ${incompatible.minimumVersion} or later, or install an extension built with your eve version.`
- **What it costs:** an error stops the whole agent building. fxbot mustn't copy that part.

**Pi** (`packages/coding-agent`): nothing, on purpose, and the cost of that.
- No host version field. Packages declare the host in `peerDependencies` "with a `"*"` range" (`docs/packages.md`).
- A mismatch shows only as a throw: `Failed to load extension: ${message}` (`src/core/extensions/loader.ts`).
- **The app stops.** `if (hasRuntimeErrors) {` exits, with `Hint: Start without extensions using "pi -ne".` (`src/main.ts`).
- Breaks are handled by people: a changelog section, "`### Breaking Changes` (API changes requiring migration)" (`AGENTS.md`), and shims, such as `"@earendil-works/pi-ai": piAiCompatEntry`.
- Its `packages/chord` is kinder: a plugin that fails "is left out, reported in the report's `failed`" (`src/node/plugins/README.md`).

**openbot** (`release-policy.json`, `shared/release-manifest.ts`): the host's release carries `"extensionApi": 1`, and it gates the host's own update: `${key} ${current[key]} does not match required ${candidate.compatibility[key]}`. Plugins declare nothing. The idea worth taking: check an upgrade before running it, as a function that says what would fail.

**fx:** no plugins. Its saved formats carry integers, so an older reader names the cause: `libfx journal was written by a newer fx` (`sdk/engine.js`).

**agent-desktop:** no plugins. A C ABI integer, major only: "ABI major version mismatch: recompile against the installed header" (`crates/ffi/src/abi_version.rs`).

**agent-browser:** no plugins. It restarts its daemon when versions differ.

**durable-harness:** nothing on plugins. `Fatal` covers "a log recorded by an incompatible build".

**OpenDuet:** vendors openbot, without its release manifest. **openmuse:** nothing, only "OpenBot returned an incompatible response." **OpenDots** and **fx0:** nothing, with no plugin system. Searched for engines, minVersion, compatib, apiVersion, peerDependencies, requires, unsupported, deprecat, and breaking.

**Grok Bot** ([overview](https://docs.x.ai/grok-bot/overview)): nothing relevant. It mentions "connected apps", with no third-party plugins and no version rule.

None of the eleven repositories has a list of plugins known to be broken.

### Other systems

**Obsidian:** `minAppVersion`, required. `versions.json` maps each plugin version to it: "the key is the plugin version, and the value is the corresponding `minAppVersion`." An older app "consults the `versions.json` to determine whether a fallback is available", and installs the newest that fits ([docs](https://docs.obsidian.md/Reference/Versions)).

**VS Code:** `engines.vscode`, required, and it "Cannot be `*`". The gallery walks versions until one fits. Otherwise: "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2})."

**Firefox and Chrome:** `strict_min_version` and `strict_max_version`. Firefox gave up on the maximum: "Starting with Firefox 10, add-ons will default to compatible", and now "Do not use strict_max_version unless absolutely necessary." ([docs](https://extensionworkshop.com/documentation/publish/version-compatibility/)). Chrome's `minimum_chrome_version` has a trap: "Existing users of your extension won't receive updates", and "This happens silently".

**JetBrains:** `since-build` and `until-build`, and the same retreat: "It's highly recommended not to set this attribute, so the plugin will be compatible with all IDE versions since the version specified by the `since-build`." A later cap moves to the Marketplace ([docs](https://plugins.jetbrains.com/docs/intellij/plugin-configuration-file.html)). The IDE also knows "Version {1} of plugin ''{0}'' is known to be broken". The [Plugin Verifier](https://github.com/JetBrains/intellij-plugin-verifier) checks a plugin's binary against the API, for missing classes and methods.

**WordPress:** `Requires at least` turns off Install, Update, and Activate, with "This plugin does not work with your version of WordPress." `Tested up to` only warns: "Untested with your version of WordPress".

**Home Assistant:** the host keeps the list, in `homeassistant/loader.py`: `BLOCKED_CUSTOM_INTEGRATIONS` pairs a `lowest_good_version` with a reason, such as `"start_time": BlockedIntegration(AwesomeVersion("1.1.7"), "breaks Home Assistant")`, read at load. Calls warn first: "This will stop working in Home Assistant {breaks_in_ha_version}".

**Grafana:** `grafanaDependency`, a semver range, and the installer picks the newest that fits. "This plugin doesn't support your version of Grafana." Its [Levitate](https://grafana.com/blog/2022/09/14/is-your-plugin-compatible-with-grafana-theres-a-tool-for-that) tool compares a plugin's API use: "we are not aiming for 100% correctness."

**OpenClaw:** two fields. `openclaw.install.minHostVersion`, "enforced during install and manifest registry loading", and `openclaw.compat.pluginApi`, for "the OpenClaw plugin SDK/runtime API floor that the package was built against." "Do not use the package version alone as the compatibility contract." ([docs](https://docs.openclaw.ai/plugins/manifest/package-json))

**Hermes Agent:** `requires_hermes`, "Enforced: installing on an older Hermes is refused with the version it needs". Update keeps the installed version "until you update Hermes", and a plugin that fails it is "skipped before import" (`hermes_cli/plugins_manifest.py`). Its docs warn that older versions don't enforce a floor kept only in a catalog, and an open issue shows a floor no release can satisfy passing its validators.

**Claude Code:** no host version field. "An unrecognized top-level key is stripped". Plugins can depend on each other by semver. **MCP** negotiates its protocol, not an app's version.

### fxbot today

Read from the code on 2026-11-06.

- **There's no rule.** `parseManifest` has no version field, and ignores what it doesn't know.
- **Plugins guard themselves,** after the owner has already added them: `if (!fx.models) throw new Error("permissions needs fxbot 0.6.0 or newer.")`. Four of fxbot's own do this. The plugin has been added by then, with its tables made.
- **A server that fails to load is handled.** `load` catches it and sets `plugin.error`, and everything else starts. An update that fails to load leaves the old version running.
- **A page that fails to load isn't.** `run(...).catch(... console.error ... emptyPlaces())` puts it in the browser's console. The owner sees nothing, and half a plugin runs.
- **Plugins follow their repository's newest commit.** `look` reads `archives.head(repo)`, and the hourly `check` marks **Update available**. fxbot's own plugins are in fxbot's repository, whose head is `main`, so an install a release behind is offered code for the newest release.
- **Browse's list is live.** An old install reads `plugins-registry.json` from fxbot.sh every hour, so it lists plugins newer than it is.
- **The pieces are there.** `compareVersions` and `isVersion` are in `releases.ts`. A plugin's code is in `page.texts` before it's added, and in its folder after. `PluginMark` is what the hourly check found. fxbot.sh already publishes three lists that installs read hourly, by `FXBOT_LISTS_URL`, with a shipped copy as the fallback.
- **The API has broken rarely, but it has:** `fxbot.addons.*` to `fxbot.plugins.*` in 0.4.0. Its rows say `Since 0.6.0`, and removals have only been in the changelog.
- **`package.json`'s version trails development.** On `release/0.7.0` it says 0.6.0 until the release commit, so a plugin on this branch that needs a new hook has a floor above the running version.
- **Own plugins aren't typechecked.** `npm run typecheck` covers the four packages. A `tsconfig` over `plugins/` passes clean today, so one would catch a break in them.

## 2. Key takeaways

1. **Everyone with plugins and a rule puts a floor in the manifest.** Obsidian, VS Code, Firefox, JetBrains, WordPress, Grafana, OpenClaw, and Hermes all do. It's the plain answer to "too new". An exact version is enough here: a floor is one number, and Obsidian's is too.
2. **Nobody should ask an author for a ceiling.** Firefox and JetBrains both tried, and both retreated. An author can't know what a release they haven't seen will break, and a ceiling stops plugins that still work.
3. **"Broken later" belongs to the host.** The package is frozen, and the host knows what it changed. Home Assistant's `BLOCKED_CUSTOM_INTEGRATIONS`, JetBrains' known-broken list, and eve's list of generations are all on the host's side.
4. **Say what broke, not just when.** eve's generation and a bare floor mark every older plugin, whether or not it used what changed. The owner asked about "something used in a plugin". JetBrains' Verifier and Grafana's Levitate look at what a plugin actually uses, and Levitate is honest that this is approximate. A plugin's code is text fxbot already holds, so a list of names costs almost nothing, and a load error stays as the backstop.
5. **Check before any of its code runs.** eve does it "before it loads the extension's code", and Hermes "skipped before import". For fxbot, that's also before its migrations.
6. **Leave it out, and carry on.** Pi exits, and eve fails the build. fxbot's owner may be away from the machine, so one plugin must never stop the rest.
7. **Never go quiet.** Chrome stops updates "silently". WordPress and Hermes both say so. A blocked update must show, or an owner will think they're current.
8. **A floor kept only in a catalog isn't enforced.** Hermes found that. It belongs in `plugin.json`, which travels with the plugin.
9. **Old installs can't learn this.** 0.6.0 ignores a field it doesn't know. The rule works from the release that ships it, so fxbot's plugins keep their guards until no one needs them.
10. **A validator must do more than parse.** Hermes accepts a floor no release can satisfy. A release has to check fxbot's own plugins against the version it's about to be.
11. **Check an upgrade before it runs.** openbot's idea, and it's what stops the owner finding out afterwards. It needs the list to reach an install before the release does, and fxbot.sh already does that.

## 3. Implementation

### The floor

`plugin.json`, beside its other fxbot keys:

```json
{
  "name": "permissions",
  "version": "0.1.0",
  "extensions": { "sh.fxbot": { "minFxbot": "0.6.0", "server": "./fxbot/server.ts" } }
}
```

- **`minFxbot`** is the oldest fxbot it runs on, as `x.y.z`. Anything else fails `parseManifest`, with a sentence saying so.
- **It's optional,** so every plugin already out there keeps working. No floor means it says nothing, and the list below still applies.
- **A prerelease counts as its release,** so `0.8.0-rc.1` meets a floor of `0.8.0`.
- **An SDK app with no version,** `0.0.0`, skips the floor.

A plugin with no code, only MCP servers or skills, has nothing to break, and needs no floor.

### What a release broke

`packages/sdk/src/plugin-breaks.json`, shipped with each release and published with the other lists:

```json
{
  "breaks": [
    { "since": "0.8.0", "uses": ["fx.models.ask"], "says": "Use fx.models.run." },
    { "since": "0.9.0", "says": "Hooks changed shape, so every plugin needs a new version." },
    { "plugin": "computer", "below": "0.4.0", "says": "It can lose a bot's files on this version." }
  ]
}
```

A plugin is **Unsupported** when an entry fits it:

| The entry | It fits when |
| --- | --- |
| `since` and `uses` | The plugin's `minFxbot` is below `since`, and its code names one of `uses` |
| `since` alone | The plugin's `minFxbot` is below `since`: everything older |
| `plugin` and `below` | It's that plugin, at a version below `below`: a known bad version |

- **`since`** is the release that broke it. An author says "I've moved on" by raising `minFxbot` to it. Nobody has to say anything about a release that didn't touch what they use.
- **`uses`** are the plugin API's names, as a plugin writes them: `fx.chats.send`, `app.box`, `ui.Reply`, or a hook such as `tool.before`. A match is a whole word, in its server and page code.
- **`says`** is one line for the owner.
- **An entry applies only on a fxbot at or past `since`.** That's what lets an older install read the published list ahead of an update.

The rule for fxbot itself, in `CONVENTIONS.md` and `AGENTS.md`, like the one for migrations: **a change that removes or breaks something in the plugin API adds a line to `plugin-breaks.json`, and a note under `## Unreleased`.**

### One check

```ts
// plugins.ts: why a plugin can't run on this fxbot, or nothing. Pure, so an update can ask it about a version it isn't yet.
function unfit(manifest: Manifest, code: string, version: string, breaks: Break[]): { needs: string } | { unsupported: string } | undefined;
```

It's the only place that decides, as openbot's `planUpgrade` is. Each moment below calls it.

### When it's checked

| When | Too new | Too old |
| --- | --- | --- |
| Its page, from Browse or by name | `page.error`: "It needs fxbot 0.8.0 or newer. This is 0.7.0." **Add** is off, and its code still shows | `page.error`: "It doesn't work on this fxbot: …" |
| **Add** | Refused, by the same `page.error`, which `add` reads already | The same |
| The hourly check | A new mark, **Needs fxbot 0.8.0**: the installed version keeps running, and there's no **Update** button | The new commit fits, so **Update** shows as usual |
| **Update** | Refused, by the same `page.error` | The same, if the new commit is broken too |
| Each start, before migrations and code | It doesn't run | It doesn't run |
| Settings' version row, with a newer release out | | "Won't run on 0.8.0: computer, foo." above **Update** |

The start check is what catches a plugin a new release just broke. It covers a floor too, for a restored backup or a downgrade.

### Unsupported

- **It doesn't run.** Its hooks, tools, routes, and page stay out. Its files, settings, and tables stay put, so nothing is lost.
- **It shows.** Its row in **Plugins** says **Unsupported**, and its tab says why: "Unsupported on fxbot 0.8.0. It uses fx.models.ask, which this version removed. Use fx.models.run."
- **The way out shows too:** **Update** when its repository has one that fits, and **Remove**.
- **A plugin that needs it** fails as it does today: "It needs computer."
- **It heals.** An update that fits runs the plugin, with no restart.

`view` gets one field, `unsupported`. It's kept apart from `error`, since it's a state with a way out, not a crash.

### A page that fails

The list can't catch everything, as Levitate says. So what's left has to reach the owner:
- `loadPlugins` keeps the error when a page's code throws, on `Loaded`, as well as logging it.
- The plugin's tab shows it, in the place a server's `error` shows: "Its page didn't load: app.box is not a function."

A server that fails already does this. That's the backstop for names the list misses, such as `const { models } = fx`.

### The published list

`plugin-breaks.json` joins `mcp-registry.json`, `skills-registry.json`, and `plugins-registry.json`: copied into the site by `astro.config.mjs`, and read hourly from `FXBOT_LISTS_URL` by `createRegistry`, with the shipped copy until a read succeeds, and a failed read keeping what it had.

- **It's how an install hears of a break ahead of time,** so the version row can warn.
- **It's how a bad version gets marked after a release,** with a push to `main` and no new release, as Home Assistant's list does in core and JetBrains' does on its Marketplace.
- **It can only stop a plugin running,** never run anything. A bad entry is fixed the same way.

### Local plugins and this branch

A plugin from `FXBOT_PLUGIN_DIRS` runs whatever the check says, with a line in its log: "It needs fxbot 0.8.0, and this is 0.7.0. It's local, so it runs."

Its author is at the keyboard, and `package.json` trails development: on `release/0.7.0` it says 0.6.0 until the release commit, so without this every plugin on a branch that uses a new hook would refuse to run in dev.

### fxbot's own plugins

- **Each sets `minFxbot`.** Each plugin's floor is the release that has everything it uses today, read from the Plugin API's `Since` notes and its guards: 0.6.0 for `messages`, `permissions`, and `routines`, whose guards say so, and whatever the build finds for the rest.
- **Their guards stay.** 0.6.0 and older can't read `minFxbot`, so `if (!fx.models) throw` is still all those installs have. They go once fxbot stops caring about those versions.
- **`plugins/tsconfig.json`** joins `npm run typecheck`, so a change to `PluginApi` that breaks a plugin's server code fails the check, the same day.
- **`scripts/check-plugins.mjs`** joins it too. For each folder in `plugins/` with code: `minFxbot` is set, it's a version, it isn't above `package.json`'s next release, and the plugin is fit for that release by `unfit`. That's the check Hermes lacks. The release workflow runs `npm run typecheck` already, so a release can't ship a break to its own plugins.

### What the owner sees

| Where | What |
| --- | --- |
| A plugin's page, before **Add** | "It needs fxbot 0.8.0 or newer. This is 0.7.0.", with **Add** off |
| **Plugins** | **Unsupported**, or **Needs fxbot 0.8.0**, in the place **Update available** shows |
| A plugin's tab | Why, and **Update** or **Remove** |
| Settings' version row | "Won't run on 0.8.0: computer, foo." above **Update** |
| fxbot.sh's directory | "Needs fxbot 0.6.0 or newer" on a plugin's page, from its `plugin.json` |

### Author docs

`write-a-plugin.md` gets a section: set `minFxbot` to the release that has what you use, and raise it when you adopt something newer. The Plugin API's `plugin.json` table gets a row, and a section on how fxbot marks what it breaks. The `Since 0.6.0` notes in that page say what to set.

### What it can't do

For the docs too, in plain words:
- It reads names in a plugin's code, so it can miss what's renamed or reached indirectly, and a name in a comment can flag a plugin that's fine.
- It knows what fxbot wrote down. A break nobody listed shows as a plugin that fails to load.
- It says nothing about a plugin that loads and behaves badly.
- 0.6.0 and older ignore all of it.
- An **Unsupported** plugin's hooks don't run, so with `permissions` a bot acts unguarded until it's fixed. That's true of any plugin that fails to load today, and it's worth the owner seeing it plainly.

### Cost

- **Idle:** one more small read an hour, with the three lists that are already read.
- **A start:** reading each plugin's two code files, already on disk, and a few string matches. Under a millisecond each.
- **A plugin that isn't added:** nothing.
- **Size in the app:** nothing in the page but a few strings.

### Not in this phase

- **Serving an older version.** Obsidian, VS Code, Grafana, and OpenClaw find the newest plugin version that fits. fxbot says "update fxbot" instead. See [open question 2](#5-open-questions).
- **A ceiling in `plugin.json`,** for the reasons above.
- **Run anyway.** See [open question 1](#5-open-questions).
- **Versions between plugins,** such as `chat-rooms-computer` needing a `computer` that's new enough. `needs` can carry it later.
- **Checking a plugin's page against the API with types.** `@fxbot/app` has no types yet.
- **A floor on Browse's cards.** A card has no `plugin.json`. The page has it, before **Add**.
- **Stubs that say what replaced a removed call.** `says` does this before it runs.
- **Plugin signing or a security blocklist.** It's a different job.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/plugins.ts` | `minFxbot`, `unfit`, the checks at each moment, `unsupported` on `view` | about 45 |
| `packages/sdk/src/plugin-breaks.json` | The list, empty at first | 3 |
| `packages/sdk/src/registry.ts`, `index.ts` | Reading it hourly | about 15 |
| `packages/sdk/src/types.ts` | The new mark and `unsupported` | about 5 |
| `packages/ui/src/packages.tsx`, `plugins-page.tsx` | The marks, and why on the tab | about 15 |
| `packages/ui/src/release.tsx` | "Won't run on" | about 8 |
| `packages/ui/src/plugins.tsx` | A page's error | about 6 |
| `packages/website/astro.config.mjs`, `src/plugins.ts`, its page | The list, and the floor on a plugin's page | about 8 |
| `plugins/*/plugin.json` | `minFxbot` | 8 |
| `plugins/tsconfig.json`, `scripts/check-plugins.mjs`, `package.json` | Own plugins, checked | about 35 |
| Website, `CONVENTIONS.md`, `AGENTS.md`, `CHANGELOG.md` | The rule, the how-to, and the Plugin API | about 60 |

Size: about 105 core lines and about 35 of checks, plus about 60 of docs.

## 4. Checklist

Checks use the harness the last phases used: a disposable Postgres, a check server on another port, a stubbed GitHub and fxbot.sh through `--import`, and Playwright at desktop and phone widths, with writes blocked on any real install. A test plugin says what each case needs: `minFxbot` of 99.0.0, or code that names an entry on the list. Nothing reaches a real model.

Print a check's setup, and match exact fields: one that tested nothing can't pass.

**The bound:**
- **Size:** at most 130 core lines, and 50 of checks.
- **Out of scope:** [Not in this phase](#not-in-this-phase).
- **If it must be cut,** `plugin` and `below` in the list go first, then the directory's line, then the version row's warning. The floor, **Unsupported**, and a page's error stay.

**M1. The rule**
- [x] `minFxbot` parses. A value that isn't `x.y.z` fails with a sentence, and a plugin with none is fine.
- [x] `unfit` answers for each case, by a table of inputs: too new, equal, older, a prerelease meeting its release, `0.0.0` skipping the floor, `since` with `uses`, `since` alone, `plugin` with `below`, and an entry whose `since` is past the running version.
- [x] A name matches as a whole word: `fx.chats.send` doesn't match `fx.chats.sendAll`.
- [x] A plugin with a floor at or past `since` isn't flagged, whatever its code says.
- [x] `npm run typecheck` passes.

**M2. Adding and updating**
- [x] A plugin that needs a newer fxbot shows its page, with its code, and the sentence, and **Add** is off.
- [x] `POST` to add it anyway fails, with no files written, no row, and no schema.
- [x] A plugin on the list is refused the same way, with its reason.
- [x] The hourly check marks an installed plugin **Needs fxbot 0.8.0** when the new commit needs that. The installed one keeps running, and it isn't silent.
- [x] **Update** to that commit is refused, and nothing moves.
- [x] When fxbot catches up, the mark becomes **Update available**.

**M3. Unsupported**
- [x] After a start on a fxbot that broke what it uses, the plugin doesn't run: no hook, no tool in a request, no route, no page. Assert on what the mock got.
- [x] Its migrations don't run, and its code isn't imported. Prove it with a line the plugin's setup would write.
- [x] Every other plugin runs, bots answer, and fxbot starts in the usual time.
- [x] Its files, settings, and tables are still there.
- [x] A plugin that needs it says so, as it does today.
- [x] **Update** to a commit that fits runs it, with no restart, and **Unsupported** goes.
- [x] A plugin with a floor above the running version, as after a downgrade, doesn't run, and says what it needs.
- [x] **Remove** works.
- [x] A local plugin runs whatever the check says, with its line in the log.

**M4. A page that fails**
- [x] A page whose code throws at load shows on its tab, with the error, as a server's does.
- [x] The rest of the app draws, and the page logs no other error.

**M5. The published list**
- [x] A new entry on a stubbed fxbot.sh reaches a running install at the hourly read, and a start uses it.
- [x] With the site down, the shipped copy is used, and a failed read keeps what it had.
- [x] A broken file changes nothing.
- [x] With a newer release out and an entry for it, the version row says "Won't run on" with the plugins it fits, and only those.
- [x] With no entry, the row is as it was.
- [x] An entry for a release this install isn't on leaves its plugins running.

**M6. The page**
- [x] **Plugins** shows **Unsupported** and **Needs fxbot 0.8.0** where **Update available** shows.
- [x] The tab says why, and offers **Update** when there is one, and **Remove**.
- [x] At 375 pixels there's no sideways scroll, and the page logs no errors. Load 5173 as well as the build, with writes blocked.

**M7. fxbot's own plugins**
- [x] Each plugin with code in `plugins/` sets `minFxbot`.
- [x] `plugins/tsconfig.json` is in `npm run typecheck`. Removing a name from `PluginApi` that a plugin uses fails it. Try one, and put it back.
- [x] `scripts/check-plugins.mjs` is in `npm run typecheck`, and fails on a floor above the next release, on a missing floor, and on a plugin the list marks.
- [x] Their guards stay, with a line saying why.
- [x] fxbot.sh's directory shows each plugin's floor.

**M8. Docs and checks**
- [x] `CONVENTIONS.md` and `AGENTS.md` have the rule: a break adds a line to `plugin-breaks.json`.
- [x] **The website:**
  - `write-a-plugin.md` says how to set `minFxbot`
  - the [Plugin API](../../../packages/website/src/content/docs/sdk/reference/plugin-api.md) has its `plugin.json` row, and how fxbot marks a break
  - the how-to for adding a plugin says what **Unsupported** and **Needs fxbot** mean, and [what it can't do](#what-it-cant-do)
- [x] `CHANGELOG.md`, under `## Unreleased`: the rule, and that it adds no migration.
- [x] `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass. New files are checked for whitespace too.
- [x] The line counts are within the bound.
- [x] This doc's Status says built, with what the build changed. It moves to `docs/_completed/phases/`, and `AGENTS.md` lists it.
- [x] The work is committed on the open release branch, core, plugins, and docs in separate commits, and not pushed.

**The human runs these:**
- **A real break:** remove something small on a branch, list it, and start. Does the message read true, and does the way out work?
- **The update row:** with a list entry for a coming release, is the warning clear before you click?
- **An older install:** does "It needs fxbot 0.8.0 or newer" tell you what to do?

## 5. Open questions

**Left,** with a default the build follows unless the owner changes it:

1. **Does Unsupported stop a plugin, or only warn?** *Default:* it stops, with no way to run it anyway. That's what keeps a bot from breaking, as Hermes and Firefox's hard block do. The price: a false match, such as a removed name in a plugin's comment, stops a plugin that's fine until its author raises `minFxbot`. A **Run anyway** switch, like Firefox's soft block, is about 10 lines.
2. **An older install wants a plugin that needs a newer fxbot: refuse, or find one that fits?** *Default:* refuse, and say to update fxbot, since that's one button. Most systems here serve the newest version that fits. For fxbot's own plugins that's cheap: read them at the tag of the running release, not `main`, about 15 lines, and an old install could still add them. For anyone else's it needs a `versions.json`, so that waits.
3. **Is a row in Plugins enough, once a plugin has gone Unsupported?** *Default:* yes, with the warning before the update. If a bot quietly loses a plugin the owner relies on, a line in that bot's chat or the sidebar may be wanted. It matters most for `permissions`, where the plugin going off means no guard.

## What the build changed

- **The open questions took their defaults.** Unsupported stops a plugin, with no **Run anyway**, an older install is refused and told to update fxbot, and a row in **Plugins**, with the warning before an update, is what shows.
- **`plugin-fit.ts` holds the rule,** on its own, so `scripts/check-plugins.mjs` can import it without loading the plugin system.
- **A change to the published list acts at once.** The plan only read it at a start, but a start loads plugins before the first read lands, so a published line would never have taken effect. So `recheck` runs after the start and whenever the list changes: a plugin a new line fits stops, and one a removed line no longer fits runs again, with no restart.
- **A plugin that needs an Unsupported one still loads.** The plan said it would fail with "It needs computer", but that's only for a plugin that's missing. `fx.need` gives it `null`, as it does for any plugin that isn't running.
- **`wontRun` names only plugins running now,** and none from `FXBOT_PLUGIN_DIRS`, since those run whatever the check says. It's on `UpdateStatus`, so `updateStatus` is async.
- **`check-plugins.mjs` reads the next release from the branch's name,** `release/<version>`, since `package.json` trails it, and from `package.json` on `main`, which is what the release workflow checks.
- **The floors:** 0.5.0 for `chat-rooms`, `chat-rooms-computer`, `computer`, and `fresh`, and 0.6.0 for `dreams`, `messages`, `permissions`, and `routines`, read from the Plugin API's `Since` notes and what each uses. `safe` doesn't raise a floor, since an older fxbot ignores it.
- **Each of fxbot's plugins shows Update available once,** since its `plugin.json` changed.
- **A dev install logs that the list didn't answer,** once an hour, until a release puts `plugin-breaks.json` on fxbot.sh.
- **The size:** it first came to 146 core lines against a bound of 130, with `recheck`, which the plan didn't have, as the largest part. Tightening it, with nothing cut, gave 130: a net 87 in existing files, 40 in `plugin-fit.ts`, and 3 in the list. The checks are 46 lines.
