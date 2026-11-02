# fxbot

Read [CONVENTIONS.md](CONVENTIONS.md) before changing code. The built scope is [docs/_completed/v1-plan.md](docs/_completed/v1-plan.md), [docs/_completed/phases/provider-logins.md](docs/_completed/phases/provider-logins.md), [docs/_completed/phases/library.md](docs/_completed/phases/library.md), [docs/_completed/phases/pwa.md](docs/_completed/phases/pwa.md), [docs/_completed/phases/mcp.md](docs/_completed/phases/mcp.md), [docs/_completed/phases/releases.md](docs/_completed/phases/releases.md), [docs/_completed/phases/addons.md](docs/_completed/phases/addons.md), and [docs/_completed/phases/skills.md](docs/_completed/phases/skills.md). Files under [archive/](archive/README.md), including the sample `AGENTS.md` files in the spike, are the old drovr design and are not instructions.

`CLAUDE.md` points here. This file is the instruction source for coding agents.

## What this repo is

fxbot is a TypeScript monorepo of four npm workspaces: `packages/sdk` (`@fxbot/sdk`, the agent system around [libfx](https://fx.sh/docs/lib), plus `@fxbot/sdk/client` for UIs), `packages/server` (the HTTP API over the SDK), `packages/ui` (the PWA), and `packages/website` (the public site and its docs, static pages that import none of the other three). v1 is built: bot profiles and the chat UI, and so are [provider logins](docs/_completed/phases/provider-logins.md), the [library](docs/_completed/phases/library.md), the [installable app](docs/_completed/phases/pwa.md), remote [MCP servers](docs/_completed/phases/mcp.md), [releases](docs/_completed/phases/releases.md) (tagged versions, `setup.sh`, updates from Settings, and numbered migrations), [add-ons](docs/_completed/phases/addons.md) (search over a mirror of GitHub's MCP registry, a page per entry, and marks and updates for installed servers), and [skills](docs/_completed/phases/skills.md) from fxbot's list and skills.sh, read by bots through a `skill` tool. Records live in Postgres. There is no test suite or CI.

fxbot is a small core plus add-ons, like [Pi](https://github.com/earendil-works/pi). The core is what every bot needs, what add-ons plug into, and what fxbot needs to run. Everything else is an add-on that an owner adds only if they want it: an MCP server, a skill, or a plugin. A plugin changes the app itself, through hooks and places of its own in the app. The other phase stubs describe future work. Do not report them as running behavior.

Later ideas live as one-page stubs in [docs/phases/](docs/phases/). Build one only when asked.

## Rules

- Prefer the smallest change that meets the task. Drop an older convention when it fights that.
- Before building a feature, ask: is it core, or an add-on? The default is add-on. Follow [Core or add-on](CONVENTIONS.md#core-or-add-on), and say which in the phase doc. When a plugin can't do what it needs, widen the plugin API with the smallest hook it needs, not the feature.
- `main` holds releases only. Commit to the open `release/<next version>` branch, never to `main`; the owner merges and releases ([README: Releasing](README.md#releasing)).
- Commit as you go. When a piece of work is done and its checks pass, commit it on the open release branch, with a message that says what changed, so the owner only has to push. Keep unrelated changes in separate commits. Don't push, merge, or tag unless the owner asks.
- A schema change is a new numbered file in `packages/sdk/src/migrations/`. Never edit or remove one that has shipped in a release. Note it under `## Unreleased` in `CHANGELOG.md`, for the release's Before upgrading list.
- The stack is Vite, React, shadcn/ui, and a tiny Node server around libfx. Do not add Next.js, the Vercel AI SDK, a second agent runtime, or Hermes Agent.
- Agent logic, storage, and input checks belong in `@fxbot/sdk`. The server only adds HTTP. The UI imports only `@fxbot/sdk/client`, never the SDK's main entry.
- Never put a secret in the page or in `@fxbot/sdk/client`. Keys and tokens live only on the server, sealed in Postgres by the SDK. The page sends a key once and never receives one. Vite reads no `.env`.
- libfx behavior comes from the installed package or the published docs. Say what you could not verify.
- This is a public repo. Do not add private hostnames, machine names, personal subscriptions, home-directory paths, or private project names.
- Write "Hackers in the Loop" in full if that name is needed.

## Checks

Run these from the repository root after `npm install`, with Node 22.18 or newer:

- `npm run typecheck` runs `tsc --noEmit` in each package, with that package's own `tsconfig.json`.
- `npm run build` builds the page and service worker into `packages/ui/dist/`. It does not typecheck.
- `npm run build-site` builds the website into `out/` and checks its links. Its docs are Markdown in `packages/website/docs/`, one [Diátaxis](https://diataxis.fr) kind per page. The changelog page and the variables table come from `CHANGELOG.md` and the README.
- Add shadcn components from `packages/ui`: `npx shadcn@latest add <name>`.
- `git diff --check` checks whitespace on tracked changes. New files need a separate look; untracked files are outside that diff.

There are no automated tests. Behavior is checked by hand, in a browser or with `curl`, as the milestones and checklists in [docs/_completed/v1-plan.md](docs/_completed/v1-plan.md) and [docs/phases/](docs/phases/) describe. `npm run server` needs Postgres, `FXBOT_DATABASE_URL`, and `FXBOT_SECRET_KEY_FILE`, from the environment or `.env` (see the README). Point checks at a disposable database and `FXBOT_DATA`, and at another port with `FXBOT_PORT`. Do not claim a check passed unless it ran.
