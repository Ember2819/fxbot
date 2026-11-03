# Streams: chats in Postgres

An open chat should cost the server nothing while nothing happens, and a long chat should be as quick to send to as a new one. Today neither is true: libfx's default store, `local()`, keeps each chat as files and re-reads them. This phase moved libfx's sessions into the Postgres fxbot already runs, through libfx's `world()` and Workflow's Postgres World, and moves each install's existing chats there on its first start. A chat page also closes its stream while the page is hidden.

Status: built in 0.4.0, on 2026-11-03. Research, prototypes, and plan came first the same day. The owner asked to build it then, before the libfx maintainers answered.

## 0. Core or plugin

**Core** ([Core or plugin](../../../CONVENTIONS.md#core-or-plugin)). Every bot needs a chat that lasts, and where libfx keeps it is part of what fxbot needs to run. No plugin can change the store under the core's own agents. The plugin API doesn't change: a plugin that reads a chat with `fx.chats.stream`, as chat rooms does, gets the new store without a change.

## 1. Research

Checked on 2026-11-03 against libfx 0.0.16, `@workflow/world-local` 5.1.1 (which libfx bundles), and `@workflow/world-postgres` 5.1.0, from their code and with prototypes on a disposable Postgres 17. A mock model streamed 500 small deltas per turn, so each turn added about 500 lines. Where the code wasn't run, this says so.

### What a chat costs on `local()`

libfx writes a chat's view, the lines the page reads, as one stream per session, with one chunk per line: each text or reasoning delta is a line. world-local stores each chunk as its own file. Measured with libfx alone:

| On `local()` | 502 lines | 2,510 lines | 25,100 lines |
| --- | --- | --- | --- |
| One idle reader | 0.75% of a core | 1.54% | 14.7% |
| Two idle readers | | | 33.1% |
| A prompt accepted after | 53–87 ms | | 1,195–1,265 ms |

- **The idle cost.** Each open `session.stream()` runs world-local's `setInterval(…, 100)`, which lists the stream's folder, sorts every name, and walks them all ([vercel/workflow#4830](https://github.com/vercel/workflow/issues/4830), open). It runs even in-process, where an event already delivers each chunk, and can't be configured. The chat page holds a stream open while the chat is on screen, so an installed app left open on a long chat kept an idle server at about 16% of a core.
- **The prompt cost.** Each prompt calls `getInfo`, which reads the first byte of every chunk file.
- **The disk.** A real chat of 24,539 lines held 2.1 MB of data in 98 MB of disk, at a 4 KB block per file. A session's events and steps, the log libfx runs from, are small beside it: in one check, 236 files holding 1.1 MB, against 13,054 stream files taking 51 MB of disk.
- Workflow describes world-local as a "filesystem-based workflow backend for local development and testing". libfx's README lists `local()` as the Node.js default, and pins world-local 5.1.1, so the line-order fix in 5.2.0 ([vercel-labs/fx#1583](https://github.com/vercel-labs/fx/issues/1583)) hasn't reached it.

### The page's part, built

The chat page now closes its stream while the page is hidden (a background tab, a minimized window, a locked phone), and opens it again from the last cursor it read when it's shown (`packages/ui/src/use-turn-stream.ts`). Checked in Chromium against a 6,024-line chat: the server went from 3.4% of a core with the page visible and idle to 0% hidden. A reply written while hidden showed once when the page came back, and so did a turn hidden partway through.

It doesn't help a page left visible, a second device, or a plugin that holds a reader. Chat rooms holds none while idle: its room stream is an in-process listener, and it reads libfx only while a bot replies.

### How libfx keeps a session

- `local({ dir })` is `world()` over world-local, with startup recovery off (`recoverActiveRuns: false`), liveness by the process's PID, and a 250 ms re-read of the log while a turn runs. Any World works the same way through `world()`.
- A session is a Workflow run. Its log is a dense sequence of `step_created` events, numbered from 1, and each entry continues the one before it by that number. Its view is one stream, and each image is a stream of its own.
- libfx batches lines into `writeMulti` when a World has it.
- A World with `registerHandler` gets libfx's queue messages in-process. One without it posts them over HTTP to `agent.wakeHandler()`.

### The references

- **[durable-harness](https://github.com/vercel-labs/durable-harness/blob/main/packages/durable-harness/README.md)** (Vercel Labs; it runs Pi, OpenCode, libfx's fx, Claude Code, and Codex on a World): "Local development uses the Workflow SDK's local World… To self-host, use the Postgres World or any other World". fxbot is a self-hosted server.
- **[fx0](https://github.com/vercel-labs/fx0)**, the app built on libfx, passes no durability option: Vercel's World on Vercel, and local files elsewhere. Its own chat history is in Redis and Postgres.
- **[pi-durable](https://github.com/earendil-works/pi/tree/main/packages/durable)** stores a conversation in SQLite or JSONL, with atomic commits. A reply's partial text is one document, `pi.live`, changed in place, not a record per delta. A watch opens on a window of the newest 50 entries, "so neither the first value nor a reconnect costs the whole transcript".
- **[OpenBot](https://github.com/CopilotKit/openbot)** keeps its records in PostgreSQL, from its own compose file as fxbot does, and its threads in CopilotKit Intelligence.

### world-postgres, read and run

From its code at 5.1.0, a parallel read of the source and issues, and the prototypes. It calls itself "a reference implementation… not tuned for the performance or scale properties" of a managed backend.

| | `local()` | `world()` on world-postgres |
| --- | --- | --- |
| Idle, no reader | 0.15% of a core | 0.5–1.4% in Node and 0.7–0.9% in Postgres at the queue's defaults: 100 transactions a second |
| Idle, queue at 4 workers polling every 10 s | | 0.09% in Node and 0.22% in Postgres: 0.9 transactions a second |
| Two idle readers on a long chat | 33.1%, at 25,100 lines | 1.39% and 0.77% at 28,112 lines: the same as none |
| A prompt accepted after, on a long chat | about 1.2 s, at 25,100 lines | 12–33 ms, at 26,606 lines |
| Opening a reader at about 28,000 lines | | 237–285 ms to read every line from 0; 23 ms from 10 lines before the end |
| `getInfo` | reads every chunk file | 5–13 ms |
| Disk | 98 MB for a real chat of 24,539 lines (2.1 MB of data) | 10 MB of stream table for 28,112 lines (2.7 MB of data); 21 MB for the whole database |
| One turn of about 500 lines | | 120–300 ms; about 1,000 transactions |

- **Streams push.** A write inserts the rows and sends a `NOTIFY` per chunk on one channel. A process with a reader on that stream reads each new chunk by its id, and an idle reader costs nothing. Opening a reader reads all of the stream's rows and skips to the start in JavaScript, which is fast at this size but grows with the chat. `writeMulti` still sends one `NOTIFY` per chunk ([vercel/workflow#5061](https://github.com/vercel/workflow/issues/5061), with a fix open). That is the 2 transactions per line above.
- **The queue polls.** It's graphile-worker 0.16.6. At world-postgres's defaults, 50 workers each fetch every 500 ms while idle ([vercel/workflow#4354](https://github.com/vercel/workflow/issues/4354)). `LISTEN` wakes them early for a new job, so a long poll doesn't slow a turn. libfx's delayed messages are backstops, for a worker that died. A running turn re-reads its own log for steers every second. The `WORKFLOW_POSTGRES_*` variables apply only when `createWorld()` is called without options, so fxbot passes `queueConcurrency` and `pollInterval` itself.
- **Delivery is in-process.** world-postgres has `registerHandler` from 5.0.4, so libfx hands it the turn with no HTTP and no route. libfx's README still says the Postgres World posts to `/.well-known/workflow/v1/flow`, which was true of 5.0.2 and 5.0.3. libfx registers its handler on a session's first use. Until then, a message falls back to HTTP and fails with "Unable to resolve base URL", and retries.
- **Startup recovery doesn't fit libfx.** `start()` re-queues every run that hasn't ended, and libfx's sessions never end. libfx's `run_created` doesn't record its queue's namespace ([vercel-labs/fx#1253](https://github.com/vercel-labs/fx/issues/1253)), so the re-queued message reaches libfx naming the agent `default`, and fails with "no libfx agent named default". Measured: each start added a job per session, and by the queue's backoff each retries for about 6 days. An idle agent named `default` drains them, since libfx acknowledges a message with no input. Simpler: **don't call `start()`**. The queue starts itself on its first send, and fxbot already resumes open turns at startup. Without `start()`, nothing was re-queued, and the first prompt was accepted in 52 ms, the next in 12–14 ms.
- **The schema.** The World's tables are in a `workflow` schema, its migrations in `workflow_drizzle`, and the queue's in `graphile_worker`. The schema name is fixed ([vercel/workflow#1813](https://github.com/vercel/workflow/issues/1813)). `start()` runs only the queue's migrations. The World's 30 run through the package's `bootstrap` command, again on each upgrade: 347 ms on an empty database. That command calls `process.exit`, so it runs as a child process.
- **Connections.** It uses `pg` with a pool of its own (10 by default), which can't be fxbot's `postgres` client. On top of the pool, its stream `LISTEN` holds one more connection, and the queue's `LISTEN` holds one from the pool. Measured: 11 connections at the defaults, and 5 at 4 workers.
- **Retention.** Nothing is deleted, as with `local()` today. libfx stores each log entry twice: a step row and an event row.
- **Weight.** libfx alone is 19 MB of `node_modules`. With world-postgres it's 75 MB: `pg`, `drizzle-orm` (17 MB), graphile-worker, a second world-local (5.2.0), and `@vercel/queue`, among about 116 packages. fxbot 0.3.0's image is 340 MB.
- **Versions.** libfx 0.0.16 was built against `@workflow/world` 5.0.4, which world-postgres 5.0.4 matches exactly. The prototypes ran world-postgres 5.1.0 (with `@workflow/world` 5.1.0) under libfx 0.0.16 without an error. No libfx test runs world-postgres.

### Moving existing chats

There is no export or import tool, so a prototype copied sessions through the World APIs. For each run in a `local()` folder, it read the events in order with `events.list` and wrote each one with `events.create`. It read each stream with `getChunks` and wrote it with `writeMulti`. Then it opened the session on `world()`:
- Two of fxbot's sessions moved, with 120 events and 13,052 stream lines, in 4.7 s. Every event landed at the same number it had.
- The next prompt ran on Postgres and sent the model the whole conversation: 25 messages.
- The stream went on from the old cursors, so a page that held cursor 6,024 would carry on.

### What the build found

- **world-postgres refuses an old run id.** `events.create` checks that a `run_created`'s run id was made within the last 24 hours (`validateUlidTimestamp` in `@workflow/world`, for Workflow's delayed starts), and nothing configures it. The prototype moved chats a few minutes old. A copy of real chats, 3 days old, was refused. A chat must keep its id, which fxbot's bots and plugins' rows hold. The check runs before `create`'s first `await`, and reads the clock with `new Date()`. So for that synchronous step alone, the move sets the clock to the time the chat began, and nothing else can run meanwhile. An import path in Workflow would be better, and is asked upstream.
- **libfx reads a session's log before it stores an image.** A first image prompt on a chat that looks 3 days old, in a fresh agent, works. It was checked with the process's clock moved ahead. So libfx's `run_created` for a session it hasn't seen, the same refusal, doesn't happen in use.
- **world-local reads a stream again for each page.** At pages of 1,000 lines, reading a 25,000-line chat took 16.6 s. At pages of 100,000 it took 1.5 s. The move reads pages of 50,000, and writes them 1,000 at a time.
- **A write to the page was answered.** fxbot's server sent `index.html`, with a 200, for any path outside `/api/`, whatever the method. If the queue ever fell back to HTTP, its delivery would have been taken as done. Writes outside `/api/` now get 405.
- **Each start adds a line to every bot's chat.** That's the `idle` answer to the resume fxbot sends each session at startup. It did the same on `local()`.
- **A killed server leaves its delivery's job locked.** world-postgres releases a dead worker's job after 4 hours, unless `jobLockStaleSeconds` is set. The job is then delivered again and does nothing, since fxbot's resume at the next start already ran the turn. That was checked by releasing one with graphile-worker's `force_unlock_workers`.
- **A queued message for a removed provider fails for days.** Its agent is gone, so the queue retries it 73 times over about 6 days, with an error in the log each time. On `local()` the queue was in memory, and such a message went at the next restart. fxbot refuses to remove a provider that bots use, so it takes a message for an old session queued just as its provider goes.
- fxbot has no API to cancel a turn, so the plan's cancel check had nothing to call.

### Options weighed

- **`world()` on world-postgres**, the plan. Everything in the database fxbot already backs up, and the references' path for a self-hosted server. Two of its problems (the queue's poll and startup recovery) are settings, measured above. The `NOTIFY` per line and the weight remain.
- **world-local's events and queue, with fxbot's own Postgres streams through `world()`.** It needs no new package, and the stream is the costly part. But the session log stays on a store Workflow calls development-only, and fxbot would own a stream implementation against the World contract.
- **fxbot's own World on `postgres`.** It's the lightest at run time, but libfx's log relies on Workflow's event semantics: slots, the in-band fence, `seq_in_band`. Too much to own.
- **Stay on `local()`** and wait for #4830. That fixes only the idle poll, and leaves the per-prompt reads, the disk, and a development store.

## 2. Key takeaways

1. **The poll is in world-local, and fxbot shouldn't run on world-local.** It's a development store, and the self-host path its makers name is the Postgres World.
2. **On Postgres, an open reader costs nothing.** Two readers on a 27,000-line chat cost the same as none, against a third of a core on `local()`. A prompt is accepted in 12–33 ms instead of 1.2 s, and the chat takes a tenth of the disk.
3. **Two settings make it idle-quiet.** Run the queue at 4 workers polling every 5–10 s, and never call the World's `start()`.
4. **Chats move exactly.** Replaying events and streams through the World APIs keeps every slot and cursor. Session ids don't change, so fxbot's profiles and plugins' session rows stay valid.
5. **The cost is weight.** About 56 MB and 116 packages, a second Postgres driver, and the World's own schema and migrations beside fxbot's. Each streamed line costs about 2 transactions until #5061's fix lands, or until libfx writes fewer lines per reply.
6. **The page closes hidden streams anyway.** On Postgres an idle reader is free, but the change keeps a phone in a pocket from holding a connection, and costs nothing.

## 3. Implementation

### The store (`packages/sdk`)

- **The dependencies.** `@workflow/world-postgres` 5.1.0 and `@workflow/world-local` 5.2.0, pinned exactly. The second is the one world-postgres brings, and only the move reads with it, so it adds nothing to install. libfx already has `world()`.
- **`sessions.ts`, new.** It creates the one World for the process and the durability every agent uses:
  ```ts
  const sessions = createWorld({ connectionString: options.databaseUrl, jobPrefix: "fxbot_", namespace: "fxbot",
    queueConcurrency: 4, pollInterval: 5000, maxPoolSize: 6, applicationManagedShutdown: true });
  return { durability: world(sessions, { name: "postgres", store: "fxbot" }), close: async () => sessions.close?.() };
  ```
  The World's `start()` is never called: it would queue every session again, for an agent named `default` (vercel-labs/fx#1253). The queue starts on its first message, and `index.ts` resumes open turns itself.
- **Its setup.** The `workflow` schema's comment names the world-postgres version that set it up. When it isn't the installed one, `sessions.ts` takes the backup fxbot takes before its own migrations, if the database has a bot and fxbot's migrations didn't already take one this start. A start backs up once, before its first change: an update that doesn't start goes back to the newest backup, which must be one the release before can open. Then it runs the package's `bootstrap` as a child process, from the package's own folder, with `WORKFLOW_POSTGRES_URL` in its environment. The child keeps `.env` out of it, and `bootstrap` ends its own process when it's done.
- **`providers.ts`.** Each provider's agent takes that durability instead of `local({ dir })`. Agent names stay `p-<provider id>`.
- **`index.ts`.** It opens the store after fxbot's migrations and before the providers, and closes it after the agents and the replies' saves.
- **`migrate.ts`.** Exports `backup()`, which the store's setup uses too.
- **The server.** A write outside `/api/` gets 405 instead of the page.

### The move (`packages/sdk/src/move-sessions.ts`, new)

At startup, after the World's setup and before the agents, if `FXBOT_DATA/sessions/runs` exists:
- Each run moves its streams, through world-local's `getChunks` and world-postgres's `writeMulti`, then its events, through `events.list` and `events.create`.
- Each event must land at the slot it had, and each stream must hold as many lines as its files. A run whose events are all in the database is skipped. Any other run is first removed by run id from every World table that has one, so a move a stopped start left partway starts that run again cleanly.
- `run_created` goes through the clock step above.
- Once every run is in, the folder is renamed `sessions.moved`, or `sessions.moved-<date>` if that's taken, and one line logs the count, the lines, and the time.

A run that can't be moved stops the start, with its id and the error. Its files stay untouched. On a release install, the update then goes back to the release before, on the backup taken before the setup.

### Backups and settings

- The backup is `pg_dump`, which now holds the chats, and `data.tar.gz` of `FXBOT_DATA`, which holds plugins' files, and `sessions.moved` until the owner deletes it.
- `fxbot restore` unpacks `data.tar.gz` over the data folder, so going back to 0.3 on the backup the update took, `before-0006_plugins`, brings `sessions/` back. 0.3 reads it as before. Updating again moves it again. A first build took a second backup before the chats' setup; a rollback would have restored that one, whose database 0.3 refuses. A check before release found it, by updating a real 0.3.0 install and rolling it back.
- `CHANGELOG.md`'s **Before upgrading**, the README, and the docs' pages on backups, going back, the install's layout, and the SDK's `dataDir` say where chats live now.

### Not in this phase

- Reading a long chat from its newest turns instead of from the start, as pi-durable does. That belongs with [past sessions](../../phases/past-sessions.md) and [context management](../../phases/context-management.md).
- Deleting old sessions. Neither store does.
- Fewer lines per reply. That's libfx's choice, and it's asked upstream.

### Size

About 260 lines:

| Part | Lines |
| --- | --- |
| `sessions.ts`: the World, its setup, close | 55 |
| `move-sessions.ts` | 102 |
| `index.ts`, `providers.ts`, `migrate.ts`, `store.ts`, and the server | 22 added, 14 removed |
| README, CHANGELOG, docs pages | 39 added, 30 removed |
| The hidden page | 24 |

## 4. Checklist

Checks ran on a disposable Postgres 17 from `deploy/compose.dev.yaml`, under another `COMPOSE_PROJECT_NAME`, with a mock model, the check server on another port, and Playwright's Chromium. They ran from a git worktree, so the owner's `npm run dev` never restarted on half-built code. Each process's CPU was measured from `/proc`, and Postgres's from its container's cgroup.

**M0. The hidden page**
- [x] Hiding the page closes its stream; the server went from 3.4% of a core to 0% on a 6,024-line chat.
- [x] Showing it reopens the stream from the last cursor. A reply written while hidden shows once, and so does a turn hidden partway through.

**M1. New chats on Postgres**
- [x] A fresh install sets up the World's schemas, and starts in about 1 s. A second start runs no setup and takes no backup.
- [x] A new bot's first message, a reply, an image, `library_search`, `memory_save`, and `memory_search` work. A message sent while a reply runs waits its turn, and both finish in order. The stream's cursors run from 1 with no gap. There's no cancel to check: see above.
- [x] A chat-rooms round runs, and both bots' replies arrive through `fx.chats.stream`.
- [x] The runner starts in the server with no `PORT` set. No queue job ever had an error, and the page now answers a write outside `/api/` with 405, so no delivery went over HTTP.
- [x] Three restarts add no job, and no job has an error.
- [x] A turn cut off by `SIGKILL` ends after the next start.
- [x] On SIGTERM during a turn, the server exits in 1.6 s with nothing in its log, and the turn ends.

**M2. Cost**, measured through fxbot, on the same 25,100-line chat in each store
- [x] Idle with no page open, over 60 s: 0.17% of a core in the server and 0.21% in Postgres, at 1 transaction a second. `local()`: 0.07% in the server.
- [x] Two visible idle pages: 0.02% in the server and 0.13% in Postgres, no more than none. `local()`: 27.5%.
- [x] A message is accepted after 21–33 ms. `local()`: 1,158–1,211 ms.
- [x] The page shows the whole chat 0.86–0.91 s after it starts loading. `local()`: 2.8–3.0 s.
- [x] 11 connections to the database, from fxbot's client and the World together. `local()`: 3.
- [x] The chat's rows: 5.5 MB of stream and 1.3 MB of events and steps, in a 9.2 MB stream table with its index. `local()`: 103 MB on disk, in 25,799 files.
- [x] The image: 399 MB, against 340 MB built from the same commit without this phase. world-postgres's packages add 59 MB.

**M3. The move**
- [x] Chats made on `local()` by the old code, with a 25,000-line chat, an image, a provider switch, and a chat room, moved in 3.9 s, about 6,400 lines a second. Every line came back the same, with the same cursor. Each bot's next reply sent the model its whole conversation: 54 messages, 3 with the image, and 2 since the switch. The room's bots answered again, from their plugin sessions. The open page showed each reply once.
- [x] Killed with 5,000 lines in, the next start finished the move. Every run's events and lines matched the files, in order and byte for byte, with none doubled.
- [x] A run with a damaged event file stopped the start, named the run, and left `sessions/` in place. With the file repaired, the next start moved the rest, and everything matched.
- [x] A copy of the owner's real chats, 3 days old, moved: 5 chats and 5,398 lines in 1.9 s, matching the files byte for byte. One of them, prompted through the mock model in a fresh agent, sent the model its earlier messages. Nothing reached the owner's providers.

**M4. Docs and checks**
- [x] README, CHANGELOG with **Before upgrading**, and the docs' pages on backups, going back, the install's layout, releases, and the SDK.
- [x] `npm run typecheck`, `npm run build`, `npm run build-site`, `podman build .`, and `git diff --check` pass. The image, run on a fresh database, sets up the store and answers a message.

**The human runs these:**
- Update their own install, and see the move's log line and time.
- Leave the app open on a long chat for an hour, and check `fxbot` stays near idle in `top`.

## 5. Open questions

Answered while building:
1. **Ask libfx first.** The owner asked to build it now. The issue for vercel-labs/fx still asks the maintainers the open points: the store they'd recommend for a Node server, and the version they test; recovery and #1253; registering the handler when an agent is made; fewer `NOTIFY`s or fewer lines per reply; and moving sessions, now with the 24-hour check.
2. **The version.** world-postgres 5.1.0, pinned exactly, as checked. 5.0.4 matches libfx's own build.
3. **The World's schema outside the numbered migrations.** Yes. The World's tables are the package's, and its `bootstrap` migrates them, after a backup, as graphile-worker migrates its own.
4. **Which release.** 0.4.0, at the owner's word.
5. **The old files.** Kept as `sessions.moved` until the owner deletes them. A later release could delete them.
6. **The queue.** 4 workers, polling every 5 s.
