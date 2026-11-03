# Streams: chats in Postgres

An open chat should cost the server nothing while nothing happens, and a long chat should be as quick to send to as a new one. Today neither is true: libfx's default store, `local()`, keeps each chat as files and re-reads them. This phase moves libfx's sessions into the Postgres fxbot already runs, through libfx's `world()` and Workflow's Postgres World. The first step, closing a chat page's stream while the page is hidden, is already built.

Status: research, prototypes, and plan written on 2026-11-03. The hidden-page step is built (in 0.4.0, commit ab2b539). The move to Postgres is planned, not built.

## 0. Core or plugin

**Core** ([Core or plugin](../../CONVENTIONS.md#core-or-plugin)). Every bot needs a chat that lasts, and where libfx keeps it is part of what fxbot needs to run. No plugin can change the store under the core's own agents. The plugin API doesn't change: a plugin that reads a chat with `fx.chats.stream`, as chat rooms does, gets the new store without a change.

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

- **The dependency.** `@workflow/world-postgres`, pinned to the exact version M1 checks: 5.1.0 unless a question below changes it. Nothing else is added: libfx already has `world()`.
- **`sessions.ts`, new.** It creates the one World for the process and the durability every agent uses:
  ```ts
  // libfx's sessions, in fxbot's Postgres. The World's start() isn't called: it would queue every session again
  // (vercel-labs/fx#1253), and the queue starts on its first message. Open turns resume from index.ts instead.
  const sessions = createWorld({ connectionString: databaseUrl, jobPrefix: "fxbot_", namespace: "fxbot",
    queueConcurrency: 4, pollInterval: 5000, maxPoolSize: 6, applicationManagedShutdown: true });
  export const durability = world(sessions, { name: "postgres", store: "fxbot" });
  ```
  Before creating it, `sessions.ts` compares the package's migration files with the rows in `workflow_drizzle.workflow_migrations`. When the package has more, it takes the backup fxbot takes before its own migrations, then runs the package's `bootstrap` as a child process, with `WORKFLOW_POSTGRES_URL` in its environment, not its arguments. `close()` closes the World after the agents.
- **`providers.ts`.** Each provider's agent takes that durability instead of `local({ dir })`. Agent names stay `p-<provider id>`.
- **`index.ts`.** It creates the store before the providers, and closes it last. The startup loop that resumes open turns stays as it is. It's also what first registers libfx's handler.
- **What it adds to the owner's waits:** a prompt is accepted about 1 s sooner on a long chat. Each streamed line costs an insert, batched, plus a `NOTIFY` and a read of that line, a few milliseconds on a local database. Loading a chat reads its rows in one query instead of its files.

### The move (`packages/sdk/src/move-sessions.ts`, new)

At startup, before the agents start, if `FXBOT_DATA/sessions/runs` exists:
- for each run, in order: its events through `events.list` and `events.create`, then each stream through `getChunks` and `writeMulti`
- check that each event lands at the slot it had, and that each stream has as many chunks as the files
- log one line per run, and one at the end with the count and the time

A run already fully in Postgres is skipped. A run found partly moved (fewer events than its files) is deleted by run id from the World's tables and moved again. Once every run is in, the folder is renamed `sessions.moved`, and the server starts. The owner deletes it once they're sure: the README says how. A run that won't move stops the start, with the run's id and the error. The old folder is untouched, so the earlier release still runs on its backup.

It reads the old files with `@workflow/world-local`, pinned to the version world-postgres brings (5.2.0), so it adds nothing to install. In the prototype, 5.2.0 read files that libfx's bundled 5.1.1 wrote. The move is the one place that reads them.

### Backups and settings

- The backup before migrations is `pg_dump`, which now includes the sessions. `data.tar.gz` holds only plugins' files, so it shrinks.
- `FXBOT_DATA` keeps plugins' files. The README's variables table stops saying it holds chats.
- `CHANGELOG.md`'s **Before upgrading** says that chats move into the database on the first start, how long that took in M3, where the old files go, and how to go back.

### Not in this phase

- Reading a long chat from its newest turns instead of from the start, as pi-durable does. That belongs with [past sessions](past-sessions.md) and [context management](context-management.md).
- Deleting old sessions. Neither store does today.
- Fewer lines per reply. That's libfx's choice, and it's asked upstream.

### Size

About 330 lines:

| Part | Lines |
| --- | --- |
| `sessions.ts`: the World, bootstrap, close | about 60 |
| `providers.ts` and `index.ts` | about 15 changed |
| `move-sessions.ts` | about 120 |
| README, CHANGELOG, docs pages | about 60 |
| The hidden page (built) | 24 |

## 4. Checklist

Checks run on a disposable Postgres 17 from `deploy/compose.dev.yaml`, under another `COMPOSE_PROJECT_NAME`, with the mock model writing 500 lines a turn, the check server on another port, and Playwright's Chromium. Measure each process's own CPU over 20 s or more, and Postgres's from its container's cgroup.

**M0. The hidden page** (built)
- [x] Hiding the page closes its stream; the server's CPU drops to its idle cost.
- [x] Showing it reopens the stream from the last cursor; a reply written while hidden shows once, and so does a turn hidden partway through.

**M1. New chats on Postgres**
- [ ] A fresh install bootstraps the World's schemas. A second start runs no bootstrap and takes no backup.
- [ ] A new bot's first message, a reply, a steer sent while a reply runs, a cancel, and images all work. A tool call, the library, and memories work too.
- [ ] A chat-rooms round runs, and its replies read through `fx.chats.stream`.
- [ ] The runner starts in the server, which listens on `FXBOT_PORT`, with no `PORT` set: messages arrive in-process, and nothing posts to `/.well-known/workflow/`.
- [ ] After three restarts, `graphile_worker.jobs` holds no job with an error.
- [ ] A turn cut off by killing the server resumes at the next start.
- [ ] On SIGTERM, the server closes its agents and then the World, and graphile-worker doesn't end the process first.

**M2. Cost**
- [ ] Idle with no page open: the server's and Postgres's CPU, and transactions a second, over 60 s.
- [ ] On a 25,000-line chat: two visible idle pages cost the same as none; a prompt is accepted in under 100 ms; the page loads the chat in under 1 s.
- [ ] Connections to the database, from fxbot's client and the World together.
- [ ] Bytes on disk for that chat, against `local()`.
- [ ] The image's size, against 0.4.0.

**M3. The move**
- [ ] A copy of a real `FXBOT_DATA/sessions`, with several bots, a provider switch, chat-rooms sessions, and images, moves. Each bot's next reply sends the model its whole conversation, and the page carries on without doubled lines.
- [ ] Killed partway through, the next start finishes the move, with no run doubled.
- [ ] A run that can't be read stops the start with its id, and leaves the folder in place.
- [ ] The time for the copy, in lines a second, is noted for the changelog.

**M4. Docs and checks**
- [ ] README (variables, backups, chats), CHANGELOG with **Before upgrading**, and the docs' pages that mention where chats live.
- [ ] `npm run typecheck`, `npm run build`, `npm run build-site`, `podman build .`, and `git diff --check` pass.

**The human runs these:**
- Update their own install, and see the move's log lines and time.
- Leave the app open on a long chat for an hour, and check `fxbot` stays near idle in `top`.

## 5. Open questions

Each has a default that the build follows unless the owner changes it.

1. **Ask libfx first.** *Default:* file the issue on vercel-labs/fx, now leaning to `world()` on Postgres, and start building after the maintainers answer or in a week. The questions: is world-postgres the store they'd recommend for a Node server, and which version do they test; recovery and fx#1253; registering the handler when an agent is made; fewer `NOTIFY`s or fewer lines per reply; and whether replaying events is a supported way to move sessions.
2. **The version.** *Default:* world-postgres 5.1.0, pinned exactly, since it's what the prototypes ran. 5.0.4 matches libfx's own build.
3. **The World's schema outside the numbered migrations.** *Default:* yes. The World's tables are the package's, and its `bootstrap` migrates them, as graphile-worker migrates its own. fxbot's numbered migrations stay fxbot's tables. A backup is taken before bootstrap runs, the same as before fxbot's own.
4. **Which release.** *Default:* the one after 0.4.0. A new dependency and a move of every chat deserve a release of their own, and 0.4.0 already ships plugins and the computer.
5. **The old files.** *Default:* kept as `sessions.moved` until the owner deletes them. The release after this one could delete them.
6. **The queue.** *Default:* 4 workers, polling every 5 s. Turns don't wait on the poll. Only a backstop after a crash does.
