# Releases

Today fxbot is a git checkout that follows `main`: whoever runs it gets every commit as it lands, half-built phases included. This phase gives fxbot versioned releases. People install a release and stay on it until they choose the next one, while the owner works on a release branch with `npm run dev`. It covers:
- one version for the whole repo, a changelog, and a tag for each release, made when a release branch merges into `main`
- `setup.sh`, which installs the newest release, or a named one, on a fresh Debian or Ubuntu machine
- updating from Settings or with `npm run update`: the new release is built beside the running one, then switched in
- numbered database migrations, with a backup before any of them runs, and a refusal to run an older release on a newer database

Status: built on 2026-11-02, after the owner answered the open questions (section 5). It was checked against a disposable git origin with four release tags, an install in `setup.sh`'s layout, a mock release feed and model, disposable databases, Chromium, and, for `setup.sh`, an isolated overlay of this machine made to look fresh: 61 checks, all passing (section 4). The PWA (44) and MCP (67) checks ran again and pass. Nothing has been released yet; that, GitHub's side of the workflow, and a real systemd machine are the owner's to try. Where the build differs from the plan, section 3 says so under **Built**. It replaced the "App updates" stub, and closed the PWA phase's leftover: a page from an old build meeting a newer server ([PWA](pwa.md#updates-packagesuisrcpwats)).

## 1. Research

These are read from shallow clones, docs, and fx's live installer, as of November 2026, without running any of them. Paths are relative to each repository.

**fx** (`vercel-labs/fx`, [fx.sh](https://fx.sh/docs))
- **A release is a commit.** A maintainer's PR bumps `pub const version` in `src/main.zig` and adds the changelog entry. `release.yml` runs on every push to `main`, and when tag `vX.Y.Z` is missing, builds, tags, and publishes. The release notes are cut from `CHANGELOG.md` between `<!-- release:start -->` and `<!-- release:end -->`.
- **Two channels.** Stable releases are GitHub Releases, with a tarball and a `.sha256` per platform, copied to a CDN whose `latest.txt` names the newest. `dev-release.yml` builds every commit on `main` into `cli/dev/<sha>/`, named by `dev.json`.
- **Install:** `curl -fsSL https://fx.sh/setup.sh | bash` reads `latest.txt` or a pinned version. It doesn't check the `.sha256` it publishes.
- **Updates** (`src/core/upgrade/`): `fx upgrade` (or `fx update`), with `--channel stable|dev`. It checks the sha256, and on stable installs only a higher version.
  - Auto-upgrade is on by default (`FX_AUTO_UPGRADE=0` turns it off). A background check runs 10 seconds after start and every 30 minutes, replaces the binary, and the footer says "update ready: ctrl+g to reload". The session carries over.
  - The notice links to `fx.sh/changelog#vX.Y.Z`.
- **libfx on npm** (`publish-libfx.yml`): stable publishes `X.Y.Z` as `latest`, only if tag `vX.Y.Z` points at that commit. Dev publishes `X.Y.Z-dev.<run>.g<sha>` as `dev`. Both use `--provenance`.

**agent-browser** (`vercel-labs/agent-browser`)
- **Manual, single-PR releases** (AGENTS.md: "There is no changesets automation"): bump `package.json`, and add a CHANGELOG entry inside the release markers.
- `release.yml` runs on push to `main`, and publishes when `package.json` differs from npm's version: binaries, `npm publish --provenance`, and a GitHub Release with the changelog notes.
- `agent-browser upgrade` (`cli/src/upgrade.rs`) reads npm's `latest`, then runs the package manager it was installed with. There is no background check, and one channel.

**agent-desktop** (`vercel-labs/agent-desktop`)
- `release.yml` runs when `Cargo.toml` changes on `main`, with workflow permissions `{}`. It creates an immutable tag through the API, a `checksums.txt`, and Sigstore provenance (`actions/attest-build-provenance`). The release environment needs a reviewer.
- `release-dry-run.yml` builds with read-only permissions and no caches, against cache poisoning. `supply-chain.yml` scans for secrets and audits the workflows with zizmor.
- `docs/install.md`: checksums "catch corruption but do not prove origin". There is no update command.

**eve** (`vercel/eve`, [eve.dev](https://eve.dev))
- **Changesets in pre mode** (`.changeset/pre.json`: `{"mode":"pre","tag":"rc"}`). A "Version Packages (rc)" PR publishes when merged, and release candidates go to npm's `latest`. PR title prefixes pick the release-note sections.
- **Apps upgrade by hand:** bump the dependency and follow `docs/guides/upgrade/*.md`. There is no upgrade command and no notice.
- **Schema** (through `@workflow/world-postgres`): 28 numbered Drizzle SQL files, applied by an explicit `bootstrap` command, recorded in a migrations table, with no lock and no down steps ("there is no rolling back past 0027").
- **The runbook** (`docs/guides/deployment/self-hosted-operations.md`): stop the old build, run `bootstrap`, start the new build.
- **Version skew.** "A self-hosted Workflow world serves one eve version at a time." Sessions running before an upgrade are stranded: their history stays readable, but they cannot resume (`409 session_stranded`).

**openbot** (`CopilotKit/openbot`)
- **Releasing** (`docs/releasing.md`): a manual workflow bumps `package.json` and renames the hand-written `CHANGELOG.md`'s `## Unreleased` to the version, in a release PR. Merging it publishes the images, tags the commit, and creates the release with that section as the notes. There is one channel.
- **The changelog** opens each release with "**Before upgrading.**", naming each migration.
- **Pinned installs.** The desktop installer reads `releases/latest` once, then keeps that version: "Only new deployments consult GitHub… restarts and repairs retain that pin." A test is named `an_installed_version_does_not_query_github_or_upgrade`. Rolling back is "the same command with an earlier version."
- **Schema:** 71 Drizzle SQL files, applied by one script inside one transaction that first takes `pg_advisory_xact_lock` (`server/src/db/apply-migrations.ts`).
  - A reach check refuses a database stamped newer than a migration it hasn't applied.
  - With the embedded Postgres, migrations run on every start. With an external one, they are "a release step, not a start step. Two replicas starting together would race."
  - There are no down steps. Old tables are left in place, so that a rollback "still finds the table it expects".
- **No backup step** before upgrading, and no update notice.

**durable-harness** stays on 0.0.x until "an explicit human maintainer decision". Its stored documents carry a `version`, and a pure `migrate(value, fromVersion)` that "Runs on read".

## 2. Key takeaways

1. **A release is a merge into `main`, and CI makes the tag** (fx, agent-browser). `main` holds releases only. Work happens on a release branch, which bumps the version and the changelog before it merges. The workflow tags `main` only after it builds, so no tag points at a broken build.
2. **Notes come from a hand-written changelog** (fx, agent-browser, openbot), with a "Before upgrading" list for migrations and anything to do by hand (openbot).
3. **Installs stay pinned until someone chooses to update** (openbot's desktop). fx updates itself by default, but fxbot's owner wants people to update when a release is ready. So Settings says when one is out, like fx's "update ready", and has an Update button.
4. **An update is built beside the running release, then switched in.** Then the Update button needs no helper with more rights: the server builds the new release in its own folder while it keeps serving, switches, and lets systemd start the new one.
5. **Migrations are numbered, take a lock, and check their place** (openbot, eve's world-postgres). fxbot is one server on its own database, like openbot's embedded mode, so they run at start. A database that has a migration this release doesn't know was used by a newer one, and is refused.
6. **Forward only, so back up first** (eve, openbot). None of the references takes a backup before upgrading. fxbot is one machine with no other copy, so the server takes one before any migration runs, whatever started the update.
7. **Chats must survive an update** (eve's stranded sessions). fxbot's chats live in libfx's session files, so a release that bumps libfx says so in "Before upgrading", and a chat started before an update is checked to carry on after it.
8. **No binary artifacts.** fxbot runs from source, so git's hashes, tags that cannot move, and the lockfile's integrity hashes do what checksums and provenance do for binaries (agent-desktop). `setup.sh` checks Node's checksum, which fx's installer skips.

## 3. Implementation

### Versions and the changelog

- **One version** for the whole repo, in the root `package.json`'s `version`. The three packages stay private and unversioned, since they ship together. The first release is **0.1.0**.
- **Semver on 0.x.** A minor release for new features, usually a finished phase. A patch release for fixes.
- **`CHANGELOG.md`** at the root, written by hand in the README's plain style. Lines collect under `## Unreleased` as work lands. At release, that heading becomes `## 0.2.0 (2026-11-20)`.
  - A release that adds migrations, bumps libfx, or needs a step by hand opens with **Before upgrading**, as openbot's does: "Migration `0002_x` adds … Chats carry on." Most releases have none.
- **The root `package.json`** also gets `repository` (the public GitHub URL, which the update check and `setup.sh` read) and an `update` script.

### Branches

- **`main` holds releases only.** Every commit on it is a release, and its tag says which.
- **Work happens on `release/<next version>`,** such as `release/0.2.0`, made from `main` after a release. The owner's `npm run dev` checkout follows it, and so do coding agents: `AGENTS.md` says to commit there, never to `main`.
- **Releasing** (the owner, when the branch is ready):

  ```sh
  npm version 0.2.0 --no-git-tag-version   # package.json and the lockfile
  # CHANGELOG.md: rename "## Unreleased" to "## 0.2.0 (<date>)"
  git commit -am "Release 0.2.0"
  git switch main && git merge --ff-only release/0.2.0 && git push
  git switch -c release/0.3.0 && git push -u origin release/0.3.0
  ```

- **A fix to a release** goes on `release/0.2.1` from `main`, releases the same way, and is merged into the open release branch after.
- **Prereleases** only when the owner asks for one: version `0.3.0-rc.1`, merged into `main` like any release. Nothing installs them unless named. Release branches are for work, and never publish.

### The workflow (`.github/workflows/release.yml`)

fxbot's only CI. It runs on every push to `main`, never on a release branch, and does nothing unless `package.json`'s version has no tag yet. Then:
1. `npm ci`, `npm run typecheck`, and `npm run build`. If any fails, there is no tag and no release, and the next push tries again.
2. **Shipped migrations never change:** compared with the newest release tag, a file in `packages/sdk/src/migrations/` may be added, but not changed, renamed, or removed.
3. It cuts that version's section from `CHANGELOG.md`, and fails if it is empty, so a release always has notes.
4. `gh release create v0.2.0 --target <commit>` makes the tag and the GitHub Release, with the section as the notes, and `--prerelease` for a version with a `-`.

It keeps its rights small: `contents: write` only on the job that publishes, no caches, and actions pinned by commit (agent-desktop). Tags never move: a repository ruleset blocks updating and deleting `v*` tags, and immutable releases are on (the owner, in GitHub's settings).

### Migrations (`packages/sdk/src/migrate.ts`, `packages/sdk/src/migrations/`)

- **Numbered SQL files,** such as `0002_update_runs.sql`, in order of their names. They replace the schema string in `store.ts`.
  - **`0001_baseline.sql`** is that string as it stands: idempotent, with its `do $$` blocks. So a database made before this phase takes it without change, and so does an empty one.
  - A file that has shipped never changes. A fix is a new file (the workflow checks).
- **`fxbot_migrations`** (`id`, `applied_at`) records each file that has run.
- **At start, before anything else,** under a session `pg_advisory_lock`, so two servers don't race:
  1. **Refuse a newer database.** If it has run a migration this release doesn't have, the server stops: "This database has migration 0007_x, from a newer fxbot. Update to it, or restore the backup taken before that update."
  2. **Back up,** when there are pending migrations and the database already holds fxbot's tables: `pg_dump --format=custom`, and a tarball of `FXBOT_DATA` (libfx's session files), into `FXBOT_BACKUPS/<date>-before-<first pending>/`, mode 0700. It keeps the last five. If the backup fails, nothing migrates, and the server stops with the reason.
  3. **Migrate:** every pending file in one transaction, each recorded as it runs. If one fails, none is kept, and the server stops naming it.
- **Going back** is a restore, in the README: stop fxbot, switch `current` back, `pg_restore --clean --if-exists` the dump, put the `FXBOT_DATA` tarball back, and start.
- **Chats carry on.** A chat's libfx session files stay where they are. A release that bumps libfx is checked for that before it ships, and says so under Before upgrading. If a bump can't resume older sessions, the release says so, and starts those chats over from a summary of their history, the way a provider switch does.
- **No migrations in code yet.** A change that needs TypeScript, such as sealing secrets again, waits for its first real use.

### Installing (`setup.sh`)

```sh
curl -fsSL https://raw.githubusercontent.com/<owner>/fxbot/main/setup.sh | sudo bash             # the newest release
curl -fsSL https://raw.githubusercontent.com/<owner>/fxbot/v0.2.0/setup.sh | sudo bash -s -- v0.2.0  # a named one
```

- **`main` is the newest release,** so its `setup.sh` is too. When the owner's domain is ready, it serves `/setup.sh` as a redirect to that address ([question 5](#5-open-questions)).
- **Debian and Ubuntu,** as root. Anything else gets the README's steps instead. Running it again finishes a broken install, and leaves a working one alone, saying how to update.
- **In order:**
  1. **Packages:** `git`, `curl`, and `postgresql` from apt.
  2. **Node 22.18 or newer,** unless `node` already is: the newest v22 from nodejs.org into `/usr/local`, checked against its `SHASUMS256.txt`.
  3. **The `fxbot` user,** its Postgres role and database with peer auth, and `/etc/fxbot/secret.key` (32 random bytes, mode 0400), as the README does by hand today. An existing key is never replaced.
  4. **The release:** `releases/latest` from GitHub, or the named tag. It lays out the install below, then runs `npm ci` and `npm run build` as `fxbot`.
  5. **`/etc/fxbot/fxbot.env`:** `FXBOT_DATABASE_URL`, `FXBOT_SECRET_KEY_FILE`, `FXBOT_DATA=/var/lib/fxbot/data`, and `FXBOT_BACKUPS=/var/lib/fxbot/backups`.
  6. **`fxbot.service`:** `User=fxbot`, `WorkingDirectory=/opt/fxbot/current`, `EnvironmentFile=/etc/fxbot/fxbot.env`, `ExecStart=<node> packages/server/src/index.ts` with the Node it found or installed, and `Restart=on-failure`. Enabled and started.
  7. **Tailscale:** it prints `tailscale serve --bg 8787`, and runs nothing on the tailnet itself.
- **The layout:**

  ```text
  /opt/fxbot/
  ├── repo/              a clone of the repository, for fetching tags
  ├── releases/v0.2.0/   a git worktree at each installed tag, with its node_modules and build
  └── current -> releases/v0.2.0
  /etc/fxbot/            secret.key and fxbot.env
  /var/lib/fxbot/        data/ (libfx's sessions) and backups/
  ```

  Data and backups stay outside the releases, so switching releases never moves them.

### Updating (`packages/server/src/update.ts`)

One module, used by the Settings button and by `npm run update`. It runs only in the layout above, and says so otherwise: "This checkout follows release/0.2.0. Update it with git pull."

1. **Pick:** `git fetch --tags` in `repo/`, then the highest stable `vX.Y.Z` above the running version, or a named tag from the command, prereleases included.
2. **Build beside:** `git worktree add --detach releases/<tag> <tag>`, then `npm ci` and `npm run build` there, while the running release keeps serving. A failure leaves `current` alone, removes the half-built folder, and says what failed.
3. **Switch:** point `current` at the new folder, atomically (a new link renamed over the old one).
4. **Restart:**
   - From Settings, the server stops taking requests, lets running turns finish, and exits with code 75. systemd starts the new release, whose migrations back up first and then run.
   - From the command, it prints "Restart fxbot: sudo systemctl restart fxbot".
5. **Prune:** keep the running release and the one before it, for going back. Older ones are removed with `git worktree remove`.

- **Refusals:** an older target (going back is a restore), and nothing newer ("fxbot 0.2.0 is the newest release"). Only one update runs at a time.
- **Going back** without a restore works when the newer release ran no migrations: switch `current` back and restart. Otherwise the older release refuses the database, and says to restore.

### Settings and the page

- **The version.** The server reads the root `package.json` and passes `version` to `createFxbot`. `GET /api/health` returns `{ ok, version }`, and every API response carries `x-fxbot-version`.
- **An old page notices.** The page is built with its version (Vite's `define`). When an API response names another one, the page asks its service worker for the new build at once, and the sidebar's existing Reload shows. This closes the PWA phase's "old pages and a new server".
- **The check.** The SDK asks GitHub for the newest stable release once a day: `GET https://api.github.com/repos/<owner>/<repo>/releases/latest`, from `repository`. Unauthenticated, one call a day is far under the limit. `FXBOT_UPDATE_CHECK=off` turns it off. A failed check is silent, and is tried again the next day.
- **Settings shows** "fxbot 0.2.0", and when a newer release is out:
  - "0.3.0 is out", its notes as plain text, and a link to the release
  - **Update to 0.3.0**, in a release install under systemd. It confirms, shows each step as it runs, then "Restarting…", and reloads once `/api/health` names the new version.
  - the commands instead, anywhere else
- **Routes:** `POST /api/update` starts an update to the newest release the check found, and takes no version, so the page can't choose what runs. `GET /api/update` reports its steps. Prereleases and named tags stay on the command.

### Where the code goes

- **`packages/sdk`:** `migrate.ts` and `migrations/` (the runner, the lock, the backup), `releases.ts` (a semver compare and the daily check), and `version` in `createFxbot`'s options and in `settings`.
- **`packages/server`:** `update.ts` (the steps, and `npm run update`), the two update routes, and the version on `/api/health` and every response.
- **`packages/ui`:** the version and update row in Settings, and the version check in the client's fetch, which calls `pwa.ts`.
- **The root:** `version`, `repository`, and the `update` script in `package.json`, `CHANGELOG.md`, `setup.sh`, `.github/workflows/release.yml`, `backups/` in `.gitignore`, the README's Install, Update, and Releasing sections, and the branch rule in `AGENTS.md`.

### Security

- **Only the owner's releases run.** An update runs code from a tag that cannot move, with dependencies pinned by the lockfile's integrity hashes.
- **The button can't choose the code.** It updates only to the newest stable release the server's own check found, from the repository in `package.json`. Anyone who can open the page could already change everything else in fxbot. The origin check refuses the button from another site's page.
- **No extra rights.** The update runs as `fxbot`, in `/opt/fxbot`, which it owns. systemd restarts it; nothing calls sudo.
- **The code is fxbot's.** The agents' user cannot write to `/opt/fxbot`.
- **Backups hold no plain secrets.** The dump holds the same ciphertext as the database, and the key file stays out of it. The backups folder is fxbot's alone, mode 0700.
- **`setup.sh` checks Node's checksum,** and fetches fxbot by tag over HTTPS. Piping it to `sudo bash` trusts the repository; reading it first is one `curl` away.
- **The check shows GitHub the machine's address** once a day. `FXBOT_UPDATE_CHECK=off` stops it.

### Built

What the build found or changed:

- **`setup.sh` picks the newest release from the repository's tags,** not GitHub's releases API. Only the workflow makes tags, so they are the same list, and `FXBOT_REPO` can point at a mirror. `FXBOT_NODE_DIST` does the same for Node.
- **`setup.sh` writes `PGPORT`.** Debian's `psql` finds its cluster's port by itself, but fxbot's driver assumes 5432. The check machine's fresh cluster took 5433, because the host's Postgres held 5432, and fxbot couldn't connect until the port went into `fxbot.env`.
- **Without systemd,** `setup.sh` starts Postgres with `pg_ctlcluster` and prints how to start fxbot, instead of installing the unit.
- **A first visit's page never reloaded.** The service worker reloads only the pages it controls, and a page opened for the first time isn't one. So Update's reload, and the sidebar's Reload from the PWA phase, did nothing there. A page no worker controls now reloads itself after asking the new worker to take over.
- **The stream reports the version too,** so an open chat notices a new server when it reconnects, without another call.
- **Release notes render as Markdown** with Streamdown, as chat replies do, instead of plain text.
- **The workflow has two jobs:** `check`, read-only, finds the version, builds, checks migrations, and cuts the notes; `publish`, the only one that can write, makes the tag and release. The notes reach `gh` through an environment variable, never pasted into the script. "Previous release" is the nearest tag in the commit's own history, and the notes lose the blank line after the heading.
- **The lock is the transaction's** (`pg_advisory_xact_lock`), not a session lock, and the backup runs inside that transaction, after the lock, so a second server waits rather than backing up twice. The first start on the owner's development database took one: a 0.96 MB dump and 2.2 MB of session files, before `0001_baseline` was recorded.
- **The version lives in `release()`,** with the newest release, and the page reads both from `GET /api/update`; settings kept only the default provider.
- **`FXBOT_RELEASES_URL`** names where the check reads, for a fork or a mirror, and the checks' mock feed.
- **Settings can update** only in `setup.sh`'s layout and under systemd, which it sees by `INVOCATION_ID`. Elsewhere it shows the command.
- **`update.lock`** in the install keeps one update at a time, across Settings and the command. A lock left by a process that died is taken over.
- **Not checked here:**
  - `actionlint`: auto mode refused downloading and running it, so the workflow was parsed with PyYAML and its steps were run by hand instead.
  - GitHub's side of the workflow, which runs only on a push.
  - A real systemd machine. The checks' own supervisor played systemd, restarting on exit 75, and `setup.sh` ran without systemd.
  - Ubuntu and arm64.

### Size

Built: about 720 lines against the estimate of 550, a third over. The workflow is twice its estimate, for its two jobs and the migration check, and the Settings row grew with the restart wait and the old-page notice.

| Part | Estimate | Built |
| --- | --- | --- |
| `migrate.ts` | 70 | 57, and `0001_baseline.sql` moved out of `store.ts` |
| `releases.ts` and SDK wiring | 50 | 51, and about 40 |
| `update.ts` and the update routes | 150 | 128, and about 45 |
| Server: version on health and responses | 15 | in the routes above |
| UI: `release.tsx`, `pwa.ts`, the client, and the Vite version | 70 | 111, and about 35 |
| `setup.sh` | 150 | 149 |
| `release.yml` | 45 | 102 |
| `CHANGELOG.md`, README, and `AGENTS.md` | docs | docs |

Each release folder holds its own `node_modules`, about 370 MB today, so an install keeps two.

## 4. Checklist

Checks run against a disposable "origin": a bare git repository in the scratchpad, with `v0.1.0`, `v0.2.0` (which adds a migration), `v0.3.0-rc.1`, and `v0.9.9-rc.1` (whose lockfile is out of step) tagged on a snapshot of this tree. They used a mock releases feed and model, disposable databases and ports, and the check script standing in for systemd. 61 checks, all passing: 11 for the workflow, 12 for migrations, 28 for updating and the app, and 10 for `setup.sh`.

**M1. Versions, branches, and the workflow**
- [x] The root `package.json` has `version` 0.1.0 and `repository`, and `CHANGELOG.md` has its first section. The real changelog's 0.1.0 section cuts cleanly with the workflow's own command.
- [x] The workflow's steps, run by hand in a scratch clone: it skips a version that has a tag, cuts exactly that version's changelog section, and fails on a missing section or a changed shipped migration. It runs only on pushes to `main`.
  - Each step's script was read from `release.yml` and run with GitHub's variables and a fake `gh`. A new stable version and a prerelease both reach `gh release create` on their commit, the second with `--prerelease`. A new migration file passes.

**M2. Migrations**
- [x] An empty database and a database made before this phase both take `0001_baseline` and start, and the second keeps its rows.
  - An empty database migrated this way has exactly the development database's tables, columns, defaults, and indexes, though that one grew by hand over five phases.
- [x] A pending migration takes a backup first: the dump restores into a fresh database with the same rows, and the tarball holds the session files. Five are kept. The folders are mode 0700.
- [x] A failing migration keeps none of the batch, and the server stops naming it. A failing backup migrates nothing.
  - A copy of the SDK with `0002_ok` and a broken `0003_broken` kept neither, and ran `0002` once the broken one was gone. Without `pg_dump` on the PATH, nothing migrated.
- [x] A database with a migration this release doesn't have is refused, with the message.
- [x] Two servers starting at once on an empty database both start, and the migration is recorded once.

**M3. Installing and updating**
- [x] `setup.sh` on a fresh Debian: a fresh install starts and answers `/api/health` with its version. Run again, it changes nothing. A bad Node checksum stops it.
  - There is no Docker here, so "fresh Debian" was this machine (Debian 13) under an overlay in private mount and pid namespaces, with Node, `/etc/fxbot`, and the Postgres cluster hidden, and a new cluster on its socket only. Every change landed in the scratchpad; the host was checked untouched after.
  - It installed Node 22 from nodejs.org against its checksum, the user, role, database, key, settings, and release 0.2.0 (the newest stable tag), all owned by `fxbot` with the planned modes. Started as its message says, fxbot answered with `0.2.0` and had run both migrations.
  - The test origin is a local folder, which git refuses to other users, so the overlay marked it safe; the real origin is HTTPS.
- [x] `npm run update` picks the newest stable tag above the current one, a named tag when given, and a prerelease only when named. It refuses an older target and a branch checkout, and says when nothing is newer. An unknown tag is refused too, and so is a second update while one runs.
- [x] The new release builds beside the running one, which keeps answering. A target whose `npm ci` fails leaves `current` alone, and its half-built folder is removed.
- [x] From `v0.1.0` to `v0.2.0` with a migration: the switch, the restart, the backup, and the migration, in that order. Two releases are kept. The old server exited with 75, and the stand-in supervisor started the new one.
- [x] A chat started on the old version carries on after the update, with the mock model, in the same session.
- [x] Going back: with no migrations, switching `current` back is enough; with one, the older release refuses until the backup is restored, then starts. Moving forward again migrates again.

**M4. The app**
- [x] `/api/health` and every response carry the version, and Settings shows it. Checked on the owner's development page too.
- [x] With the mock feed newer than the running version, Settings shows the notice, its notes, and Update. With `FXBOT_UPDATE_CHECK=off`, no request goes out. Without systemd, Settings can't update.
- [x] Playwright: Update in Settings shows each step, the server restarts under the stand-in supervisor, and the page reloads on the new version. This found the first-visit reload bug under **Built**.
- [x] `POST /api/update` takes no version, and is refused from another site's page.
- [x] Playwright: a page from the old build, after the server updates, offers Reload at once. No page errors.
- [x] README Install, Update, and Releasing sections, the `AGENTS.md` branch and migration rules, `npm run typecheck`, `npm run build`, and `git diff --check`.

**The human runs these:** turn on the tag ruleset and immutable releases, commit the build, release 0.1.0 from `main`, make `release/0.2.0`, watch the workflow publish, install with `setup.sh` on a second machine, and update it to the next release from Settings.

## 5. Open questions

The owner answered these on 2026-11-02:

1. **The first version.** 0.1.0.
2. **Where it goes in the order.** Next, before [add-ons](addons.md).
3. **An Update button in Settings.** Yes. It needs no extra rights, because the new release is built beside the running one ([Updating](#updating-packagesserversrcupdatets)).
4. **Prereleases.** Only when the owner asks for one. Work happens on a release branch until it is ready to merge into `main` and be tagged. After the build, the owner narrowed it: the workflow runs only on `main`, and release branches never publish.
5. **An install script.** Yes: `setup.sh`, installing a release tag from GitHub. The owner has a domain for it, not ready yet, so the first address is the repository's raw file.
6. **Migrations.** Yes: numbered files, so each new version migrates the database correctly.

The build took the default for the last one:

7. **Release notes.** `CHANGELOG.md` by hand. Notes generated from commits would carry "wip" commits.
