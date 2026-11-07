# Library

One place for everything the bots' chats hold.
- **One copy of each file in the whole system,** keyed by the SHA-256 of its bytes. The name plays no part: two different photos named `photo.jpg` are two items.
- **Tagged with every bot and chat it came from.** When a bot saves bytes the library already holds, from another chat or another bot, the existing item gains a tag for that bot and chat. There is never a second copy.
- **Two views of it.**
  - **The bot's own library** shows in a right panel beside its chat, under the panel's Library tab.
  - **The full Library page** opens from a bento button next to Settings, ChatGPT style. It lists and searches items across every bot, and a filter narrows it to one.

| Item | Origin | Arrives with |
| --- | --- | --- |
| Images sent in a chat | `uploaded` | this phase |
| Text files sent in a chat | `uploaded` | this phase |
| Documents a bot writes | `generated` | this phase, through `library_save` |
| Images, video, and audio a bot generates | `generated` | [media generation](../../phases/media-generation.md) |
| Voice memos | `uploaded` | [voice memos](../../phases/voice-memos.md) |
| Pages | `generated` | [pages](pages.md) |

Before this phase:
- fxbot keeps each image a message sends in `images`, per bot, and shows it only in that bot's chat.
- A text file goes into the prompt and is not kept.
- Nothing a bot makes is kept outside its libfx session.

Status: built on 2026-11-01, and checked against a mock model server and disposable databases: 167 checks, all passing (section 4). Real models and a phone are still to be tried by hand. Where the build differs from the plan, section 3 says so under **Built**.

## 1. Research

These are read from source and docs, as of November 2026. Each path is relative to its repository.

**libfx 0.0.16** ([images](https://fx.sh/docs/lib/images), [tools](https://fx.sh/docs/lib/tools), the installed package, and `sdk/` and `src/` in `vercel-labs/fx`)
- **Prompt blocks.**
  - The blocks are text, image, and resource. There is no PDF, audio, or video block, so a text file reaches the model only as text.
  - Images are PNG, JPEG, GIF, or WebP: "Each prompt takes up to 8 images, with at most 3.75 MiB of raw data per image and 6 MiB in total". "the file contents must match `mimeType`".
- **Each session keeps its own copy of each image, by SHA-256.**
  - "A durable agent saves each image once with its session, whether a prompt, a steer, or one of your tools carries it."
  - "A session keeps its newest 4,096 images, up to 512 MiB of them … Older images leave the conversation, and the model sees a note in place of each."
  - The store has `put` and `get`, and no delete (`sdk/engine.js:238`, `sdk/durable.js:114`).
- **`sourceRef`.**
  - What it is:
    - It lets an image block "name an original your application stores". "libfx doesn't fetch the original."
    - In the core it is an "Owned opaque host reference, never filesystem or network authority" (`src/core/shared/types.zig:1382`).
    - It is at most 512 bytes, with no control characters (`sdk/engine.js:666`).
  - What it does:
    - libfx drops the bytes of an image it cannot send, for its size or its dimensions, and keeps the reference.
    - The model is told "Host source reference: … Use an available host-provided tool that accepts this reference to make a new copy …, then return the copy as image data" (`src/core/images/image_data.zig:162`, `src/core/agent/runtime/execution_memory.zig:1056`).
  - Not verified: whether an image that left the 4,096-image window keeps its reference in the model's note.
- **Tools.**
  - A tool returns images as `{ type: "libfx.tool-result", text, images }`: up to 8, base64, each with an optional `sourceRef`.
  - `execute` gets `executionId`, "the same if the call runs again after a crash", and the session's `context`.
- **No files for agents.** A libfx agent has only the tools its host gives it. `FxWorkspace` belongs to terminals, not agents. Anything a bot makes reaches fxbot through a host tool, or not at all.

**fx0** (`vercel-labs/fx0`)
- **Design artifact.**
  - Its one artifact is a "design artifact": one self-contained HTML page per chat, at most 512 KiB (`lib/design-artifact.ts:4`).
  - Versions are rows in `fx0_generations (session_id, revision, turn_id, html, bytes, created_at)`, keyed by chat (`migrations/002_history.sql:21`). Only each turn's last revision is kept.
  - The tools are `read_design`, `publish_design { html }`, `edit_design { edits }`, and `screenshot_design` (`lib/tools.ts:53`).
- **Images** are kept in Vercel Blob at `chats/<sessionId>/<handle>`. Their only record is a Redis hash, with no hash or created time (`lib/design-assets.ts:41`, `lib/journal.ts:612`).
- **Serving.**
  - Images go out under their stored type, with `content-security-policy: default-src 'none'; sandbox` and `nosniff` (`app/api/artifact-image/route.ts:46`).
  - The page previews in an iframe with `sandbox="allow-scripts"` on an opaque origin, and its CSP sets `connect-src 'none'` (`lib/design-artifact.ts:34`, `:133`).
  - An export is `text/plain` as an attachment (`app/api/artifact/route.ts:46`).
- **There is no list or search across chats.** The sidebar lists chats only.

**eve** (`vercel/eve`)
- **No artifact or library of files.** "Artifact" means build and eval output.
- **Attachments are content-addressed in the session's sandbox,** at `/workspace/.eve/attachments/<sha256 prefix>/<name>` (`packages/eve/src/harness/attachment-staging.ts:41`).
  - Their only record is a ref in the history, `eve-sandbox:?path&size&type…` (`packages/eve/src/internal/attachments/sandbox-refs.ts:1`).
  - "eve deletes the sandbox when the parent session ends", files and all (`docs/sandbox/index.mdx:146`).
- **What the model sees.**
  - It always gets the label `Attached file <path> (<type>)`. The bytes follow only for small images, and for PDFs up to 20 MiB.
  - Other files, such as CSV and audio, reach the model as the label only (`docs/sandbox/index.mdx:176`).
  - An image or PDF whose bytes do not match its type is stored as `application/octet-stream` (`packages/eve/src/internal/attachments/media-metadata.ts:53`).
- **Its notes defer first-class files:** "Store backend …, retention, deletion, auth" (`research/tool-result-media.md:183`).

**openbot** (`CopilotKit/openbot`)
- **Uploads.**
  - They are `attachments` rows with the bytes in `bytea`, beside the metadata. "One `pg_dump` restores a deployment" (`server/src/db/schema/core.ts:509`).
  - A listing must never select the bytes.
  - A row knows its channel and uploader, but not its bot or message.
- **No search.** A pgvector document index was dropped (`server/drizzle/0010_drop_the_document_index.sql`).
- **Types and limits.**
  - Images are PNG, JPEG, GIF, or WebP up to 8 MiB. Text is txt, md, csv, or json up to 1 MiB. SVG is refused.
  - The server sniffs the type from the bytes, never the client's claim, and serves with `nosniff`: "how a 'text' file with HTML in it becomes a page rendered on this app's own origin" (`server/src/channels/attachments.ts:1263`).
- **Cache lesson.** `max-age=3600` kept a deleted image painting from the browser's cache. It became `private, no-cache` with an ETag (`server/src/channels/attachments.ts:1218`).
- **Unflagged truncation.** A text file is cut at 120,000 characters for the model, and the user is never told (`shared/attachments.ts:76`).
- **Delete gap.** A deleted channel is only marked deleted, so its files are never freed (`server/src/channels/routes.ts:776`).
- **No media gallery.** "Gallery" means its catalogue of UI components.

**OpenDuet** (`CopilotKit/OpenDuet`, with an older copy of openbot under `openbot/`)
- **Pages.**
  - Pages are `openduet_pages (id, owner_user_id, bot_id, channel_id, kind, title, summary, thumbnail, theme, content jsonb, …)` (`openbot/server/src/db/schema/openduet.ts:33`).
  - Their kinds are `page`, `slides`, `dashboard`, `doc`, `design`, and `design-system`.
  - Deleting a bot deletes its pages.
- **Tools.**
  - `make_page` saves a page and tells the model "never paste its content into the chat". `read_page { id }` reads one (`openbot/server/src/openduet/pages.ts:589`).
- **The Make tab** is a two-column grid of thumbnails, newest first, with kind chips filtered in the browser. A page opens as a sheet with Revise and Delete (`openbot/app/src/components/shell/make-screen.tsx`).
- **The mistake:** a page never records its chat. The tool saves with `pages.save(actorId, botId, input)`, so `channel_id` stays null (`openbot/server/src/openduet/wiring.ts:222`).

**OpenDots** (`CopilotKit/OpenDots`)
- **Pages.**
  - Pages are Markdown rows with `sourceThreadId` (`src/server/pages.ts:23`).
  - `SpaceLibrary` has a grid or list toggle, a sort by recent or name, and search over title and content in the browser (`src/client/SpaceLibrary.tsx:36`).
- **The mistake:** the agent's `create_space_page` never passes the thread, so a page a bot makes has no provenance (`src/server/page-tools.ts:40`).

**openmuse** (`CopilotKit/openmuse`)
- **Files.**
  - Its files are PDFs, kept on disk at `dataDir/files/<uuid>.pdf` with mode 0600 (`apps/server/src/files.ts:64`). Their metadata is in Postgres.
  - They belong to an owner, not a thread, and the list is not searched.
- **Serving.** Files go out through 15-minute signed URLs that are "never stored in messages" (`apps/mobile/src/thread-artifacts.tsx:62`).
- **The mistake:** an iframe pairs `allow-scripts` with `allow-same-origin`, which isolates nothing (`apps/mobile/src/BrowserConsole.web.tsx:14`).

**durable-harness, agent-browser, agent-desktop**
- **durable-harness.**
  - It keeps a run's files in an append-only, SHA-256-addressed blob stream (`packages/harness-world/src/blobs.ts:4`).
  - The mistake: reading one blob reads the whole stream (`blobs.ts:108`).
- **agent-browser** saves screenshots to a temp folder and guesses MIME types from the extension.
- **agent-desktop** keeps per-session debug files only.
- **Across all of these:** none has a library across agents, and none serves HTTP `Range`.

**Grok Bot** ([overview](https://docs.x.ai/grok-bot/overview)): files belong to the account's shared computer, "available to every Bot you run". There is no library or gallery of outputs.

**Products** (outside the reference list; they set what a library screen is expected to do)
- **ChatGPT.**
  - April 2025: an image library in the sidebar, for generated images only.
  - March 2026: Library, for files "uploaded or created" in chats.
    - It has browse, search by file name, filters, download, delete, and reuse in another chat.
    - Deleting a chat keeps its files; a file is deleted from Library itself.
  - OpenAI's [help page](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt) refused a direct fetch with 403, so this comes from its search listing and press coverage.
- **Gemini** "My Stuff" ([Android Central](https://www.androidcentral.com/apps-software/google-is-making-it-a-lot-simpler-to-find-your-gemini-made-media), [9to5Google](https://9to5google.com/2025/12/03/gemini-web-redesign-dec-2025/)):
  - It holds generated images, videos, and Canvas documents, apart from the chats. It was later split into Media and Documents.
  - An item opens the chat that made it.
- **Claude:** an Artifacts space in the sidebar lists your artifacts ([support page](https://support.claude.com/en/articles/9487310)).

**The owner's target design** (a screenshot of the layout to match)
- **Left sidebar.**
  - It holds the bots, as today.
  - Its bottom row pairs the account with a bento icon button, which opens the full library.
- **Right panel** beside the chat. Its header is the bot's large blob and name, with a close button.
  - **Tabs:** Details, Library, and Computer.
  - **The Library tab** lists the bot's items in two cards, "This week" and "Older". Each row is a small icon or thumbnail and a one-line title, and each card ends in "Show more".
- **Chat.** A page the bot made shows as a card in its chat, which is [pages](pages.md) work.

**Checked here**
- **Postgres 17.11, in disposable databases.**
  - **Slices are fast under the default storage.**
    - A 48 MiB incompressible `bytea`, as media is, stays uncompressed under the default storage, so `substring(data from … for 1048576)` at its end takes 0.5 ms.
    - That matches `SET STORAGE EXTERNAL`.
    - A 48 MiB compressible text takes 9 ms.
  - **Names need splitting.**
    - `to_tsvector('simple', 'quarterly-report_v2.final.md')` is a single `host` token, so "report" finds nothing.
    - Spaces in place of the separators give `quarterly report v2 final md`.
  - **The split must use ASCII separators.**
    - Under collation `C`, `[^[:alnum:]]` treats `é` as a separator, so `café-crème` becomes `caf cr me`.
    - Replacing only `-_./\` gives `'café' 'crème'` under any locale.
  - **No prefix match from `websearch_to_tsquery`:** "repo" does not find "report". `to_tsquery('simple', 'repo:*')` does.
  - **Large texts need a cap.**
    - A text of 300,000 distinct words fails the insert: "string is too long for tsvector (3397986 bytes, max 1048575 bytes)".
    - Its first 200,000 characters index in 86 ms, into 279 KB.
  - **The section 3 schema works on a mock of today's tables.**
    - **The move.** It recovers each image's sent name and session, then drops `images`. A second run does nothing.
    - **Shared bytes.** The same photo, held by two bots under two names, moves as one item with two tags.
    - **Saving again.** Saving bytes the library holds, from another chat and under another name, hands back the existing item and adds one tag, in one statement. The same save again adds nothing.
    - **Deleting.**
      - Deleting a bot keeps the item, and its tags lose their bot. Deleting a second bot does not collide with the first.
      - Deleting the item deletes its tags.
    - **Search.** "repo" finds `quarterly-report_v2.final.md`, and "q3" finds a document whose text holds `https://example.com/q3-report.pdf`.
    - **Order.** Listing by each item's newest matching tag works.
      - Across all bots, an item another bot saved yesterday comes first.
      - Filtered to one bot, the same item sits at that bot's own save date.
      - Keyset paging on that date and the id goes on from there.
- **Safari:** "HTTP servers hosting media files for iOS must support byte-range requests" ([Apple](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html)). Video and audio need `Range`; images do not.
- **GitHub's raw files** (`raw.githubusercontent.com`) are served with:
  - `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `x-content-type-options: nosniff`, and `x-frame-options: deny`
  - text as `text/plain; charset=utf-8`, and images under their own type with the same policy
- **fxbot today:**
  - **Images.**
    - `images (profile_id, name, type, data)` names each image `sha256.ext`, and cascades on profile delete (`packages/sdk/src/store.ts`).
    - It is served at `/api/profiles/:id/uploads/:name` as `immutable`, and each `sent` record keeps that URL.
  - **Text files.** One is inlined as `File: <name>` text and kept only as `{ name, type }` in `sent` (`attach` in `packages/sdk/src/index.ts`).
  - **Session order.** `attach` runs before a first send claims the session, so an upload does not yet know its session.
  - **Upload sizes.** The page shrinks images to fit 1600 pixels before sending (`packages/ui/src/attachments.ts`). An upload is small enough to be its own thumbnail.
  - **Deleting a bot** says "Its conversation files stay on the server": libfx's session files stay, and the Postgres rows cascade.
  - **Names.** `kinds` is already the provider kinds' name in `types.ts`.
  - **The bento icon.** lucide's `LayoutDashboardIcon` is four tiles of uneven height, a bento box.
  - **The chat header** holds the bot's blob, its name, and an Edit link to `/profiles/:id/edit`.
  - **Already installed:** shadcn's `sheet` and the `use-mobile` hook, for a right panel on phones.

## 2. Key takeaways

1. **No reference has this library.**
   - eve, fx0, openbot, and libfx keep files per chat or per session. OpenDuet and openmuse keep them per owner, without the chat. None searches across agents.
   - ChatGPT's Library and Gemini's My Stuff show the screen people expect: everything in one grid, searchable, each item leading back to its chat.
2. **Keep the bytes in Postgres, in one `library` table.**
   - fxbot's images are already there, and openbot does the same, for one backup.
   - The default storage serves slices fast, so no blob store and no files on disk.
   - A listing never selects the bytes.
3. **One copy of each file, keyed by its SHA-256,** as libfx's image store and eve key theirs.
   - Bytes the library already holds are never stored twice: the save tags the existing item instead.
   - A retried send or a re-run tool call adds nothing.
4. **Tags are rows: one per bot and libfx session that saved the item.**
   - Every item can lead back to its chats, the provenance OpenDuet and OpenDots lose. A list covers every bot unless a filter narrows it.
   - An item outlives its bots: deleting a bot keeps its items, marked as from a removed bot.
   - One SDK call saves and tags, whoever makes the item. Uploads and `library_save` use it now; media generation, voice memos, and pages use it later.
   - **Two views read one list call:** a bot's panel, with that bot's tags, and the full page, with every bot's.
     - Both order items by when they were last saved, over the tags the view covers.
     - So a bot's "This week" means that bot saved the item this week.
5. **Bots reach the library only through host tools, and only items tagged for their bot,** as `chat_history` keeps to its bot. Items go by reference: the tools return ids and summaries, as fx0's and OpenDuet's do. A bot is tagged onto an item only by saving its exact bytes, so no content crosses from one bot to another.
6. **Every image block names its item, `sourceRef: "library:<id>"`.** That is the use libfx documents. When libfx cannot send an image, the model gets the reference, and `library_read` returns the copy.
7. **Search with Postgres full text.**
   - It covers the name and a document's text, split at ASCII separators, with prefix matching and the text capped at 200,000 characters.
   - An image is found by its name, as in ChatGPT's Library. Vectors and image descriptions wait for [memories](memories.md) and the [knowledge base](../../phases/knowledge-base.md).
8. **Serve files as data.**
   - Check images from their bytes. Serve documents as `text/plain`, with `nosniff` and a `sandbox` CSP, as GitHub, fx0, and openbot do.
   - Use `private, no-cache` with the SHA-256 as ETag, so a deleted item stops showing (openbot's lesson).
   - No HTML or SVG: pages bring a sandboxed viewer, and fx0's opaque-origin iframe is the model.
9. **Deleting an item removes the one copy, for every bot it is tagged with.** It removes fxbot's copy only: the libfx session keeps its own copy of an image until it ages out, and a document's text stays in the conversation. The UI says so.
10. **Range waits for media.** Video and audio need `Range` for Safari, and none of the references serves it. It comes with the first video or audio item. A `substring` slice is fast enough.

## 3. Implementation

### Items

| Field | Holds |
| --- | --- |
| `id` | 12 hex characters, like a profile's |
| `kind` | `image` or `document`; later `video`, `audio`, and `page` |
| `origin` | `uploaded` (the user sent it) or `generated` (a bot or a tool made it) |
| `name` | The file name, 1 to 255 characters |
| `type` | The MIME type. Images: checked from the bytes. Documents: as given, or `text/plain` |
| `size`, `sha256` | Bytes, and their hash, which is unique across the library |
| `text` | A document's text, to search by; empty for an image |
| `createdAt` | When the bytes were first saved |

`name`, `origin`, and `createdAt` come from the first save. A later save of the same bytes under another name tags the item and keeps its name.

Each item has one or more **tags**:

| Field | Holds |
| --- | --- |
| `profileId` | The bot. It becomes null when the bot is deleted, and the tag and the item stay. |
| `sessionId` | The libfx session. Null only for an image kept before the library whose chat is unknown. |
| `createdAt` | When this bot and chat saved it |

- **Images** are PNG, JPEG, GIF, or WebP, and the SDK checks the magic bytes against the type: `\x89PNG`, `\xFF\xD8\xFF`, `GIF8`, or `RIFF…WEBP`.
- **Documents** are UTF-8 with no NUL, the check `attach` already makes.
- **Other types wait** for the phases that make them. The kind list is `itemKinds` in `types.ts`, because `kinds` names the provider kinds.

### Postgres

```sql
create table if not exists library (id text primary key, sha256 text not null unique, kind text not null,
  origin text not null, name text not null, type text not null, size int not null, data bytea not null,
  text text not null default '', created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('simple',
    regexp_replace(name || ' ' || left(text, 200000), '[-_./\\]+', ' ', 'g'))) stored);
create table if not exists library_tags (item_id text not null references library on delete cascade,
  profile_id text references profiles on delete set null, session_id text,
  created_at timestamptz not null default now(), unique (item_id, profile_id, session_id));
create index if not exists library_tsv on library using gin (tsv);
create index if not exists library_tags_bot on library_tags (profile_id, created_at desc);
```

- **The unique tag key** has no `nulls not distinct`. Every save has a bot and a session, so a repeat always conflicts. Nulls come only from the move and from deleted bots, where two tags without a bot must not collide.

**The move from `images`** runs once, in the schema, guarded like the pins column. A `do` block is one transaction.
- Each image row gets the name its `sent` record gave it, and the session and time of the message that sent it, from `messages`.
- Rows with the same hash, from several bots, become one item, named by the earliest. Each row becomes a tag.
- An image with no `sent` record keeps its stored name, with a null session.
- Then `images` is dropped. This is the block checked in section 1:

```sql
create temp table moved on commit drop as
  select i.profile_id, split_part(i.name, '.', 1) as sha256, coalesce(f.name, i.name) as name, i.type, i.data,
    m.session_id, coalesce(m.created_at, now()) as created_at
  from images i
  left join lateral (select s.message_id, e->>'name' as name from sent s, jsonb_array_elements(s.files) e
    where s.profile_id = i.profile_id and e->>'url' = '/api/profiles/' || i.profile_id || '/uploads/' || i.name limit 1) f on true
  left join lateral (select session_id, created_at from messages
    where profile_id = i.profile_id and message_id = f.message_id and role = 'user') m on true;
insert into library (id, sha256, kind, origin, name, type, size, data, created_at)
  select distinct on (sha256) left(replace(gen_random_uuid()::text, '-', ''), 12), sha256, 'image', 'uploaded', name, type,
    octet_length(data), data, created_at
  from moved order by sha256, created_at;
insert into library_tags (item_id, profile_id, session_id, created_at)
  select l.id, mv.profile_id, mv.session_id, mv.created_at from moved mv join library l using (sha256);
drop table images;
```

- **Old URLs keep working.** `/api/profiles/:id/uploads/:name` stays for chats sent before the move, and reads `library` by the SHA-256 in the name.
- **A save is one statement.** It inserts the bytes, or finds the item that holds them, and tags it for the bot and session, with a repeat tag skipped:

```sql
with item as (insert into library (…) values (…) on conflict (sha256) do update set sha256 = excluded.sha256 returning …),
  tag as (insert into library_tags (item_id, profile_id, session_id) select id, $bot, $session from item on conflict do nothing)
select … from item;
```

- **The bytes travel with every save,** even when the library holds them already. At libfx's 3.75 MiB an image, that costs less than a second statement and its race.

### SDK (`packages/sdk/src/library.ts`)

`createLibrary(sql)` returns:
- **`save({ profileId, sessionId, origin, name, type, bytes })`**: checks the item as above, then saves and tags it in one statement. A document's text comes from its bytes. Returns the `LibraryItem`, new or already there. Every maker of items calls this.
- **`list({ q?, profileId?, kind?, before?, limit? })`**: returns `{ items, next }`, 60 items at a time by default, newest saved first. Both views call it: the bot panel with `profileId`, the full page with or without it.
  - It joins `library_tags`, with the bot filter on the tags, groups by item, and orders by `max(t.created_at)`. That date is the item's `savedAt`: the last time any bot saved it, or with `profileId`, the last time that bot did. The query is the one checked in section 1.
  - Each item carries the bots of its matching tags, with null for a removed bot.
  - `q` becomes its letters and digits (`/[\p{L}\p{N}]+/gu`, at most 8 words), each as `word:*`, joined with `&`, for `to_tsquery('simple', …)`. Words of letters and digits need no escaping.
  - `before` is the last item's `savedAt` and `id`, compared in `having`, for keyset paging that new items cannot shift.
  - Listings never select `data`. They carry `preview`, the first 200 characters of `text`.
  - The tags keep their session, though no view filters by it yet. [Past sessions](../../phases/past-sessions.md) can show one chat's items.
- **`get(id)`, `file(id)`, `remove(id)`**, plus `upload(name)` for the old URLs. `remove` deletes the one copy and every tag on it.
  - `file` returns the bytes with the item, and serves an `If-None-Match` from the stored hash without reading the bytes.

**Bot tools.** They go on every agent beside `chat_history`. Each takes the bot from the session's `context`, never from the model. Search and read see only items with a tag for that bot.

| Tool | Input | Returns |
| --- | --- | --- |
| `library_search` | `{ query: string, kind?: "image" \| "document", limit?: 1–20 }` | One line per match: date, `library:<id>`, kind, name, and a `ts_headline` snippet |
| `library_read` | `{ id }`, with or without `library:` | A document: its name and text up to 60,000 bytes of UTF-8, cut at a whole character, ending in "[cut at C of N characters]" when cut (see **Built**). An image: `{ type: "libfx.tool-result", text: name, images: [{ type: "image", mimeType, data, sourceRef }] }`. |
| `library_save` | `{ name, text }` | Saves a document the bot wrote as `generated`. The type comes from the name's extension: `.md`, `.txt`, `.csv`, or `.json`, the rest refused. At most 1 MiB. Bytes the library holds already get this bot's tag instead. Answers `Saved "<name>" to the library as library:<id>.`, with the item's own name. |

- **All three are `idempotent: true`.** A `library_save` run again after a crash saves the same bytes for the same bot and session, so it hands back the same item and adds no tag.
- **The descriptions** tell the model to save a document when the user wants to keep it, and to name items by `library:<id>`.

### Uploads (`packages/sdk/src/index.ts`)

1. **`send` claims the session before `attach`,** so every upload knows its chat. A claimed session with no prompt is a state `send` can already leave behind today.
2. **`attach` checks libfx's image limits before it saves anything:** 8 files, 3.75 MiB each, and 6 MiB together. A message that libfx would refuse saves nothing.
3. **Each file is saved and tagged for the bot and the chat,** as a new item or onto the one that holds its bytes already. Each image block gets `sourceRef: "library:<id>"`.
4. **The `sent` record keeps `{ name, type, url: "/api/library/<id>/file" }` for every file, text files too,** so the chat can open a text attachment.

### Serving (`packages/server`)

| Route | SDK call |
| --- | --- |
| `GET /api/library?q=&profile=&kind=&before=&limit=` | `library.list` |
| `GET /api/library/:id` | `library.get` |
| `GET /api/library/:id/file` | `library.file` |
| `DELETE /api/library/:id` | `library.remove` |

Both file routes, the new one and the old upload URL, send:
- `content-type`: an image's own type, or `text/plain; charset=utf-8` for every document, whatever its stored type
- `x-content-type-options: nosniff`
- `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`
- `cache-control: private, no-cache`, with `etag: "<sha256>"`; a matching `If-None-Match` gets 304
- with `?download=1`, `content-disposition: attachment; filename*=UTF-8''<name>`

### Client and types

- `types.ts` gains:
  - `itemKinds`
  - `LibraryItem`: `{ id, kind, origin, name, type, size, profileIds, preview, createdAt, savedAt, url }`, where `profileIds` lists the bots of its matching tags, with null for a removed bot
  - `LibraryQuery`
  - `LibraryPage`: `{ items, next }`
- `@fxbot/sdk/client` gains `library.list(query)`, `library.get(id)`, and `library.remove(id)`. A file is read through the item's `url`.

### UI

**The footer.**
- The sidebar footer becomes one row: Settings, then at its right a bento icon button (`LayoutDashboardIcon`, labelled "Library").
- The button opens `/library`, and shows as active there.
- The [herdr button](../../phases/herdr-screen.md) joins the row later.

**The bot panel** (`packages/ui/src/bot-panel.tsx`) is a right panel beside a bot's chat.
- **Opening it.**
  - The chat header's Edit link becomes a panel button (`PanelRightIcon`).
  - From `md` up, the panel is a 360-pixel column beside the chat, and the chat narrows. On a phone, it is a `Sheet` from the right.
  - Whether it is open, and its tab, are kept per browser in `localStorage`.
- **The header:** the bot's blob at 80 pixels, following the pointer, then its name and a close button.
- **Tabs:** Details and Library. The design's Computer tab is left out of this phase.
  - **Details** shows the bot's provider and model, the first lines of its instructions, and Edit, which opens `/profiles/:id/edit`.
  - **Library** shows this bot's items, from `library.list({ profileId })`.
    - They sit in two cards: "This week" (saved in the last 7 days) and "Older".
    - Each row is a 28-pixel thumbnail (the image itself, or the kind's icon), then the name on one line.
    - A card shows 5 rows. Its "Show more" shows 20 more, loading the next page when the loaded ones run out.
    - A row opens the preview below.
    - The list loads again when the bot's turn ends, so a document it saved appears.
    - With nothing saved, it says: "Nothing saved yet. Files you send <bot>, and documents it saves, show up here."

**The full page** (`packages/ui/src/library.tsx`, at `/library`):
- **The header.**
  - It holds `Library`, a search field (250 ms debounce), kind buttons (All, Images, Documents), and a bot select (All bots, then each bot).
  - The filters live in the query string, so Back keeps them.
- **The grid.**
  - Even square tiles: `grid-cols-2`, 3 columns from `sm`, 4 from `lg`.
  - An image tile is the image itself, `loading="lazy"` and `object-cover`. A document tile shows `FileTextIcon`, the name, and four lines of its preview.
  - Every tile carries the date and its bots' blobs at 20 pixels: up to three, then "+N". A removed bot shows as a gray circle.
  - A Load more button follows `next`.
- **Empty states.** "Nothing in the library yet. Images and files you send, and documents bots save, show up here." A search with no match says so.

**The preview** lives in `library.tsx`, and both views use it. A tile or a row opens a dialog:
  - **The item:** the image, or the document's text (Markdown through Streamdown, other text in `<pre>`).
  - **Where it came from:** "Sent by you" or "Made by a bot", with the date and size, then each bot it is tagged with, linking to its chat (`/profiles/<bot>`). A removed bot shows as "Removed bot", with no link.
  - **Download.**
  - **Delete,** after "Remove <name> from the library, for every bot? The chats it came from keep what the bots saw."
**The chat.**
- A text file in a message opens its item's file.
- The bot delete dialog says its library items stay in the library.

**Components** come from shadcn only: `sheet`, which is installed, and `tabs`, added with `npx shadcn@latest add tabs`.

### Where the code goes

- **`packages/sdk`:**
  - `library.ts`: the table's queries, `save`, `list`, the file reads, and the three tools.
  - `store.ts`: the schema and the move from `images`, minus the `images` queries.
  - `index.ts`: `send` order, `attach`, the tools on every agent, and `fxbot.library`.
  - `types.ts`, `client.ts`.
- **`packages/server`:** the four routes and the file headers. The old upload route now reads the library.
- **`packages/ui`:**
  - `library.tsx`: the full page and the preview.
  - `bot-panel.tsx`: the right panel, with its Details and Library tabs.
  - `app.tsx`: the route, the footer row, the panel button and its place beside the chat, and text attachment links.

### Built

What the build found or changed, checked against libfx 0.0.16, Postgres 17, and the mock:

- **libfx caps a host tool's result at 64 KiB of UTF-8.**
  - A 65,522-byte result went through; 65,542 bytes came back as "Host tool result exceeded the configured limit". Newlines and quotes count once, `é` twice. No option changes it, and the docs do not mention it.
  - So `library_read` returns a document's text up to 60,000 bytes, cut at a whole character, not the plan's 100,000 characters. The note says how many characters were kept: "[cut at 60,000 of 150,004 characters]".
- **libfx refuses a tool call of about 1 MiB.** The turn ends with `EventTooLarge` before the tool runs, and nothing is saved. 900,000 characters went through. `library_save` keeps its own 1 MiB check at the edge.
- **Tool images reach the model as a user message,** "The tool "library_read" returned 1 image(s).", with the image after it. A 2.7 MiB image read back whole.
- **libfx keeps each image block's `sourceRef`** in the session's stored input, beside the image's hash.
- **Postgres.js:**
  - It sends a `timestamptz` parameter through a JS `Date`, which keeps only milliseconds, so items saved in the same millisecond were skipped between pages. The cursor is cast `::text::timestamptz`, and paging was checked with 16 items sharing one time.
  - It reads a null inside a `text[]` back as the string `"NULL"`, so a listing's bots come from `jsonb_agg`.
- **Search.** The page's search needs every word, as planned. `library_search` takes any of them, ranked, as `chat_history` does after the same change (see provider logins), because a bot guesses at words. A query with no letters or digits filters nothing. `library_search` with an empty query lists the bot's newest items.
- **Documents** keep their type when it looks like a MIME type and is not an image type, and `text/plain` otherwise. An SVG, which is text, is kept as a `text/plain` document, so only checked images claim an image type, which the chat draws as an image. HTML is kept as a document too. All documents go out as `text/plain`.
- **`file`** returns the item's name, kind, type, and hash with the bytes, not a whole listed item.
- **The move** adds `on conflict do nothing` to its tag insert, so a bot can never get two tags for one item and chat from it.
- **`attach`** checks every file, its type and libfx's limits, before it saves any. The session is claimed first, so a refused message can leave a claimed session with no prompt, as the plan allowed.
- **UI.**
  - `go` and `follow` moved into `nav.ts`, so the new screens share them without importing `app.tsx`. A followed link keeps its query string.
  - The panel reads its list again whenever the chat's count of finished turns changes.
  - "This week" reads the next page only while no Older item is loaded; "Older" reads on whenever there is a next page, because the list is newest first.
  - The preview reads the item again, so a list narrowed to one bot still shows every bot the item is tagged with.
  - After the first build, the owner asked for less repetition: the panel opens straight on its tabs, with the close button beside them and no blob or name, and the chat header drops the bot's blob and keeps its name only for screen readers. The sidebar already shows which bot is open. Messages to a bot are drawn in its color, with white or near-black text, whichever contrasts more.

### Later phases plug in here

- **[Media generation](../../phases/media-generation.md):**
  - Saves `image`, `video`, and `audio` items as `generated`, through `library.save`.
  - Adds single `Range` requests (206, `content-range`) to the file route, read with `substring`.
  - Decides how large an item may be. The default storage held 48 MiB without trouble, and beyond some size the bytes may belong on disk.
  - Shows a bot's new item as a card in its chat.
- **[Voice memos](../../phases/voice-memos.md):** `audio` items, `uploaded`.
- **[Pages](pages.md):** `page` items, with their own format, a sandboxed viewer, and whether a page has versions.
- **[Past sessions](../../phases/past-sessions.md):** a tag's chat link goes to that tag's own session, not only the bot's current one.
- **[Memories](memories.md) and the [knowledge base](../../phases/knowledge-base.md):** search by meaning, with vectors over library documents.

### Security

- **No secret is involved.** Nothing here reads or returns a key.
- **Files are data:**
  - checked types
  - `nosniff`, and a `sandbox` CSP that runs nothing even when a file is opened in its own tab
  - documents as plain text
  - no HTML or SVG
- **A bot's tools see only items tagged for that bot.** The bot comes from the session's context.
  - A bot is tagged onto an item only by saving its exact bytes, so no content crosses from one bot to another.
  - It does see the item's name from the first save, which may have come from another bot's chat.
  - An item whose every tag has lost its bot is reachable from the library screen only.
- **No login, as before.** fxbot still has none, so anyone who can open the page can read or delete every item. The next steps are the ones in [provider logins](provider-logins.md).
- **Deleting removes fxbot's one copy, for every bot, and only that copy.** The libfx session keeps its own copy of an image until it ages out, and the conversation keeps a document's text. libfx's image store has no delete.

### Size

Built: about 760 lines, against the estimate of 700. It adds no dependency and no process.

| Part | Estimate | Built |
| --- | --- | --- |
| `library.ts` (queries, save and tag, list, files, three tools) | 180 | 221 |
| `store.ts` (schema, move from `images`) | +35 | +22 |
| `index.ts` (`send` order, `attach`, API) | +25 | −1: the image helpers moved into `library.ts` |
| `types.ts`, `client.ts` | +30 | +23, +9 |
| Server (four routes, file headers, 304) | +35 | +25 |
| `library.tsx` (full page, preview) | 220 | 250 |
| `bot-panel.tsx` (panel, Details, Library tab) | 140 | 178 |
| `app.tsx` (route, footer row, panel beside the chat) | +30 | +22, plus `nav.ts` at 13 |
| `components/ui/tabs.tsx` | added by shadcn, not counted | 87, from shadcn |

## 4. Checklist

Build in this order. Done means every box is ticked, with its check run. The checks use:
- a local Postgres, with a fresh database for each run
- disposable `FXBOT_DATA`
- the mock Chat Completions server, scripted to call tools as the `chat_history` checks were

They never use a real account or key.

**M1. Table and move**
- [x] `library`, `library_tags`, and their indexes exist. On a copy of today's data, each image moves with its sent name and its session, and `images` is gone.
- [x] The same image held by two bots moves as one item with two tags.
- [x] A second start moves nothing.
- [x] Chats sent before the move still show their images through the old upload URL.
- [x] Deleting a bot keeps its items, and their tags lose that bot. An item tagged for another bot too stays in that bot's reach; the rest stay listed and searchable, and no bot's tools reach them.
- [x] Deleting an item deletes its tags, for every bot.

**M2. Uploads**
- [x] An image and a text file sent in a chat become two items, `uploaded`, each tagged with the bot and the session. The first message of a new chat knows its session.
- [x] Sending the same `messageId` again adds nothing, and the same image twice in one chat is one item with one tag.
- [x] The same image sent in another chat, or to another bot, under any name, is still one item: it gains a tag, and the library holds its bytes once.
- [x] Two different photos both named `photo.jpg` are two items.
- [x] An image whose bytes are not its type, or images over libfx's limits, are refused before anything is saved.
- [x] The image blocks in libfx's stored input carry `sourceRef: "library:<id>"`, and each `sent` file carries its item's URL.

**M3. Search and listing**
- [x] "repo" finds `quarterly-report_v2.final.md`, and "café" finds `café-crème.md`.
- [x] A word in a document's text finds the document, and a word in an image's name finds the image.
- [x] With no filter the list covers every bot, each item once, newest saved first. `profile` and `kind` narrow it, and an item tagged for two bots shows under both.
- [x] Filtered to one bot, items order by that bot's own saves: an old item the bot saves again today comes first in its list.
- [x] Paging with `before` neither repeats nor skips an item while new ones arrive.
- [x] A 2 MB document of distinct words saves, and its first 200,000 characters are searchable.
- [x] No listing response holds file bytes.

**M4. Bot tools**
- [x] `library_save` saves a `generated` document tagged for the session's bot. The same call again returns the same item, and a `.html` name is refused.
- [x] A document saved byte for byte the same as one another bot holds returns that item, now tagged for both, and this bot's `library_search` finds it.
- [x] `library_search` returns only the session's bot's items, even when the query names another bot's file.
- [x] `library_read`:
  - returns a document's text with the cut note past 60,000 bytes, on a whole character
  - returns an image as a tool-result image
  - takes `library:<id>`
  - answers not found for another bot's item

**M5. Serving**
- [x] An image goes out with its type, `nosniff`, the CSP, `private, no-cache`, and its ETag, and a matching `If-None-Match` gets 304.
- [x] A document holding `<script>` goes out as `text/plain`. `?download=1` sends an attachment under the item's name.
- [x] A deleted item is 404 on both routes, and leaves an open chat's image on reload.

**M6. UI** (Playwright against the mocks)
- [x] The bento button sits beside Settings in the footer row, and opens `/library`.
- [x] The grid shows images and documents from two bots. Search, kind, and bot narrow it, and Load more pages on.
- [x] The bot panel:
  - The chat's panel button opens it beside the chat on a desktop width, and as a sheet at 390 pixels. It stays open across reloads.
  - Details shows the provider and model, and Edit opens the bot's settings.
  - Library lists only this bot's items, in "This week" and "Older", and Show more reveals more.
  - A document the bot saves during a turn appears once the turn ends.
  - A row opens the same preview as the full page.
- [x] A tile's preview offers Download, a link to each of its bots' chats, and Delete, and Delete removes the tile.
- [x] An item tagged for two bots shows both blobs, and its preview links to both chats. A deleted bot's tag shows as "Removed bot", with no link.
- [x] At 390 pixels wide the grid is two columns, with no sideways scroll.

**M7. Docs and checks**
- [x] Update the README, `packages/sdk/README.md`, `AGENTS.md` (built scope), and this page: a **Built** section and line counts.
- [x] `npm run typecheck`, `npm run build`, and `git diff --check` pass, and new files get a look.

**The human runs these**
- Ask a real model to write and save a document, then to find it from another chat of the same bot.
- Ask about an image from an older chat, so the bot reads it with `library_read`.
- Use the library on a phone.

**Left out of this phase**
- Video and audio items, and `Range` requests.
- Pages and HTML.
- PDFs and office files. libfx has no PDF block, and reading one needs a parser.
- Uploading into the library outside a chat.
- Free-form tags, folders, and collections.
- Removing one bot's tag from an item while keeping the item.
- Server-made thumbnails.
- Search by meaning.
- Cards in the chat for items a bot saves.
- Opening an item's own older session, and a filter for one chat's items.
- The design's Computer tab, and its share button in the panel.

## 5. Decisions

Answered on 2026-11-01.

| Question | Decision |
| --- | --- |
| What happens to a bot's items when it is deleted? | They stay. Their tags lose the bot, and the library shows "Removed bot". |
| What can a bot's tools reach? | Only items tagged for that bot, for now. [Cross-bot messaging](cross-bot-messaging.md) may widen this later. |
| Which tools? | `library_save`, `library_search`, and `library_read` |
| What is one item? | One file, by the SHA-256 of its bytes, across the whole system. The same bytes saved again, from any chat or bot, under any name, tag the existing item. |
| What does the grid look like? | Even square tiles |
| Tags? | The bot and its chat, set by saves. Nothing more this phase. |
| Where does one bot's library show? | In a right panel beside its chat, on the panel's Library tab. The bento button next to Settings opens the full page across every bot, ChatGPT style. |

Still open:
- Whether a later save's name should be kept beside the first one, so each bot sees the name its own chat gave the file. The plan keeps only the first name.
- What else belongs on the panel's Details tab. The plan shows the provider, the model, and the start of the instructions, with Edit opening today's settings page, and does not move that form into the panel.
