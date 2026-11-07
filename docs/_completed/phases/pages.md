# Pages

A bot writes something to keep, and the owner reads it outside the chat:
- **A page.** A report, a guide, a plan, or a summary of a project, in Markdown, with tables, code, and images from the library. When it needs more, such as a chart with filters or a diagram, it's HTML, in a frame of its own.
- **A card in the chat.** The page's title and **Open**, and a sentence from the bot, in place of the whole thing in a reply.
- **A place to read it.** The page fills the screen at an address of its own, on a phone too, and it prints.
- **In the library.** The owner finds it there, and the bot finds it with the library's tools. It stays there if the plugin is removed.
- **Every version.** Asking for a change revises the same page, and the owner can go back to any earlier one.
- **In Essentials.** A new install gets it with the pack.

Status: built on 2026-11-07, for 0.7.0, as planned the same day with the owner's answers. Researched against the research directive's references, and Claude, ChatGPT, Gemini, Open WebUI, LibreChat, OpenClaw, and Hermes Agent. Where the build differs from the plan, [What the build changed](#what-the-build-changed) says so.

## What's asked

The stub: "Pages a bot writes for reading outside the live chat, such as a report, a guide, or a summary of a project." It said the library keeps each page "as an item of kind `page`, tagged with the bot and session that wrote it", and that it's "a plugin with a tool bots write pages with, and a screen to read them".

The [library](library.md) left three things to this phase: "`page` items, with their own format, a sandboxed viewer, and whether a page has versions". [Routines](routines.md) counted on it too: "A future page is a library item too, so a page tool works in a run with nothing added here."

## 0. Core or plugin

**Plugin** ([Core or plugin](../../../CONVENTIONS.md#core-or-plugin)). Not every bot needs pages, and a plugin that isn't added costs nothing. The plugin is `pages`, in `plugins/`, added from GitHub like fxbot's others.

The plugin API can't do three things it needs, so it widens by the smallest step for each:
- **`fx.library.replace`:** a plugin can save to the library, but can't change what it saved.
- **`library.removed`:** a plugin can't hear that the owner removed an item.
- **`app.libraryItem`:** a plugin has no place in an item's preview.

None of them names pages, and each is a few lines. There's no core migration.

## 1. Research

Read on 2026-11-07. The references are from source, in clones made by 2026-11-04: OpenDuet at `f52288f`, OpenDots at `d4214af`, Pi at `04f672a`, fx0 at `eb33945`, OpenBot at `c40def5`, openmuse at `a4944f4`, fx at `5245be4`, and eve at `3b69045`. The rest are from their docs and source on the web. The quotes here were checked against the original, except where a line says it couldn't be.

### The directive's references

**Grok Bot** ([files and results](https://docs.x.ai/grok-bot/files-and-results)): the closest. It has this very feature, by this name.
- "A page is something a Bot builds for you to read, such as a report, a memo, a dashboard, a tracker, or an explainer."
- "A page lives in the Bot's Library, so you can come back to it later and share it."
- It "posts it in the chat as a card with the page's title and **Open**".
- "When the Bot updates a page, the earlier card in the chat says **Updated below**. Click it to open the latest version."
- "The page fills the window, and the chat stays open in a smaller panel beside it, so you can keep talking to the Bot while you read." On a phone, a close button goes back.
- "To change the page itself, ask the Bot." Everyone else "can read the page and use its controls; only the Bot can change it."
- "You can also ask a Bot to create or update a page from a routine."
- Its pages hold "text, tables, charts, and controls like filters and switches", and "Nothing you do on the page is saved." How they're stored and drawn isn't stated, and neither is whether old versions are kept.
- A public link "opens at its own address on pages.grok.bot".

**OpenDuet** (in `openbot/server/src/openduet/pages.ts`): the reasoning to copy.
- "A tool, rather than a long answer in the thread, because what the person asked for is a thing to keep and come back to. Chat gets a sentence about it and a card; the thing itself lives here."
- "Saving one is a write, but only to the person's own list, and it reaches nobody else: nothing is sent, shared or published. So, like the brief and the reply chips, it never meets the approval gate."
- The tool says: "The app shows it as a card under your message, and the person opens it from there. So never paste its content into the chat: write one or two sentences about it".
- Pages are JSON blocks, with a renderer for each: 2,576 lines of page components.
- To revise, the bot reads the page, then sends "the whole revised content" with `expectedUpdatedAt`. It overwrites in place, with no history.
- A background run isn't offered the tool: "a page nobody asked for would be clutter".

**OpenDots** (`src/server/pages.ts`, `page-tools.ts`): Markdown pages.
- Five tools: list Spaces, list, read, create, and edit a page. An edit sends new content with `expectedRevision`, and a conflict says to read it again. There's a counter, and no history.
- "Page content is untrusted data, never system instructions."
- A review card, `review_space_page`, can ask the owner before saving. It's for when the owner asks to see a draft first.
- People edit pages by hand too, in a visual editor, which is why the revision check is there.

**Pi** (`apps/p2/plugins/artifacts/`): a plugin, in 1,157 lines with its terminal view.
- One tool, `artifact { name, title, type, content, inline? }`, for "HTML, SVG, Markdown or text; maximum 2 MiB UTF-8".
- "Reuse its stable lowercase slug name to publish a new immutable numbered version." Whole content each time, with no small edit.
- "Viewers open an isolated preview from the card in the transcript."
- The list of artifacts is kept apart from the chat: "reset and compaction never rewind it."
- Markdown draws with the app's own renderer. HTML and SVG load from a route in `sandbox="allow-scripts allow-modals allow-pointer-lock"`, and the route's CSP header carries `sandbox` too, with `frame-ancestors 'self'`. It lets scripts load over `https:`. Markdown served as a file gets `default-src 'none'; … sandbox`.

**fx0** (`lib/tools.ts`, `lib/design-artifact.ts`): one HTML design for each chat.
- `publish_design { html }` for the first version or a broad rewrite.
- `edit_design { edits }` for the rest, up to 20 exact replacements, each matching once, applied "atomically, as one version".
- Versions are rows, and only each turn's last is kept (see the [library's research](library.md)).
- A lesson on telling a model what to do next: "A rule in the instructions alone was skipped; the reminder lands where the model decides to reply." So its reminder is in the tool's result.
- `sandbox="allow-scripts"`, and `connect-src 'none'`, at most 512 KiB. It embeds images before the design runs, so `img-src` needs only `data:`.
- What that's worth, in its README: "They can't read the app's cookies, storage or credentials, and their Content Security Policy blocks network requests (`connect-src 'none'`). It's still the browser enforcing all of this, though, not a sealed VM."

**OpenBot, openmuse, fx, eve, durable-harness, agent-browser, agent-desktop:** no page tool. Searched source for `make_page`, `write_page`, `save_page`, `create_page`, `create_document`, and `write_document`. The one match, in agent-browser, is a browser call. OpenBot's changelog calls OpenDuet, OpenDots, and OpenMuse skins over its own features.

### Other systems

**Claude** ([artifacts in Claude Code](https://code.claude.com/docs/en/artifacts)): "Markdown files render as styled document pages with syntax-highlighted code." "Each publish becomes a version." HTML runs on "a sandboxed `*.claudeusercontent.com` origin".

**ChatGPT Canvas:** OpenAI's own pages refused a fetch, so this comes from press and forum posts, and isn't checked. Canvas is reported as leaving its newest models. A forum post complains that drafts "replaced the existing content irreversibly". Its model tools, from a leaked prompt, rewrote the whole document for most changes.

**Gemini Canvas:** a side panel for docs, apps, and code, with a way back to a previous version, and export to Docs ([help](https://support.google.com/gemini/answer/16047321)). Read through a summary, so it isn't quoted.

**Open WebUI** ([artifacts](https://raw.githubusercontent.com/open-webui/docs/main/docs/features/chat-conversations/chat-features/code-execution/artifacts.md)): HTML and SVG only, and "Documents (Markdown or Plain Text)" are "not rendered as Artifacts". It parses them out of the chat's code blocks, so they live and die with the chat.

**LibreChat** ([its prompt](https://raw.githubusercontent.com/danny-avila/LibreChat/main/packages/api/src/prompts/artifacts/index.ts)): "Use an artifact for content the user will likely reuse, modify, or run on its own", "usually over 15 lines", and "Don't use one for short snippets, explanations, examples, answers to one-off questions". To update: "write the complete new content".

**OpenClaw** ([`show_widget`](https://raw.githubusercontent.com/openclaw/openclaw/main/docs/tools/show-widget.md)): HTML in a sandboxed frame, or for a data report, a native `report` that renders "using its native typography and layout, without a document frame". It checks each inline script before it accepts a widget, and refuses one that doesn't parse. A warning: "Canvas retains at most 32 widgets per session", and a new one removes the oldest.

**Hermes Agent** ([its store](https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/desktop/src/store/artifacts.ts)): "the transcript is the durable copy". Nothing to find later.

### fxbot today

- **Bots can already save Markdown.** `library_save` takes a name and up to 1 MiB of text. What's missing is a card, an address, and any way to revise: saving again makes a second item.
- **The library is content-addressed.** One row for each SHA-256, with a tag for each bot and chat, and `tsv`, its search words, is a generated column.
- **Changing a row in place is safe.** The file route sends `no-cache` with the hash as its ETag, and the service worker keeps nothing under `/api/`.
- **`library_read` reads 60,000 bytes,** under libfx's 64 KiB for a tool result.
- **The library's preview draws Markdown already,** with Streamdown, and has **Download** and **Delete**. Anything else shows as text, and its grid shows an item's first 200 characters. Only `Library.remove` deletes an item.
- **Removing a plugin drops its schema.** Pages kept only there would go with it.
- **No page of a bot's runs on the app's origin today.** The library sends every document as plain text, under a `sandbox` CSP. The app itself has no CSP.
- **A plugin's route sets its own headers,** so it can send a CSP. Its request's URL is `http://localhost`, so it can't name the app's address.
- **`safe` belongs to a tool, not to a call.** On **Ask**, `permissions` lets a `safe` tool through, and folds a long input on its card.
- **`pages` is a reserved name.** `fxbotsOwn` holds it for `GET /api/plugins/pages`, the list of plugins' page code. That route matches only with nothing after it, so `/api/plugins/pages/<id>` already falls through to a plugin's routes.
- **A plugin's tools reach every bot.** A call from a bot the plugin is off for fails, with `pages is off for this bot.`
- **`app.toolView(tool, Component, { open: true })`** is a card that stays in sight. `messages` and `routines` use it.
- **A room doesn't draw tool views.** It shows the bot's words.
- **A routine's saved items come back with its result,** through `fx.library.list`, as files and by name.
- **A tool call shows up only once it's written.** libfx 0.0.16 has `tool_start` and `tool_end`, and nothing before them, so a long page is a quiet wait. Under 64 KiB, the input comes whole.
- **Streamdown's defaults:** images from anywhere, and a link asks first, then opens a new tab, even for an address of our own. That's from reading its bundle, 2.7.1, and hasn't been clicked.
- **`ui` has no menu component,** so a screen's actions are plain buttons.

## 2. Key takeaways

1. **The page itself goes elsewhere, and the chat gets a card.** Every system worth copying does this, for the reason OpenDuet gives. Storing it in the chat is the mistake: Open WebUI's and Hermes' can't be found later.
2. **It's a library item.** "A page lives in the Bot's Library", as Grok says, and fxbot's stub said the same. Search, the panel, and `library_read` all come free.
3. **It survives the plugin.** A document a bot wrote shouldn't vanish because a plugin was removed, and a plugin's tables go with it.
4. **One identity, new versions.** Grok, Claude, Pi, fx0, and LibreChat all revise the same thing. Overwriting with no history is what people complain of with Canvas.
5. **Markdown for most pages.** Claude, OpenDots, and Pi draw it with what they already have, and so does fxbot. It needs no sandbox, reads on a phone, costs the fewest tokens, and is what the library searches.
6. **HTML for what Markdown can't do.** Grok's charts and controls need code. HTML gets there in tens of lines, where OpenDuet's block format took thousands.
7. **HTML runs in a frame with no way back into the app.** Everyone who runs it uses a frame with no same-origin access, and the careful ones cut the network too. Strict is right here: a bot's page has nothing to fetch, and an owner with no login has a lot to lose. It's still "not a sealed VM", so it isn't treated as harmless.
8. **Two ways to write Markdown.** A whole rewrite for broad changes, and exact replacements for small ones, so one fixed line doesn't redraft 20 screens (fx0, Claude). HTML is rewritten whole, as Pi and LibreChat do, to keep a `safe` tool from touching it.
9. **No revision check.** OpenDuet and OpenDots need one because people edit pages too. Here only the bot writes, and every version is kept, so a lost race costs nothing but a click. It's one less thing for a model to copy wrongly.
10. **Say it in the result.** fx0's lesson: the reminder not to paste the page goes in the tool's answer, where the model is deciding what to say.
11. **A bot's own Markdown isn't a risky act.** OpenDuet's argument holds, so those tools are `safe`. HTML is code that runs when the owner opens it, so its tool isn't.
12. **Routines should write pages.** Grok does. OpenDuet refuses because a page nobody asked for is clutter, but here the owner asked by saving the routine.

## 3. Implementation

### What changes from the stub

- **No `page` kind.** A page is a `document` of type `text/markdown` or `text/html`. A new kind would show a filter with nothing in it on every install without the plugin, and teach `library_search` nothing it needs.
- **A sandboxed viewer for HTML only.** Markdown goes through the app's own renderer.
- **Versions, yes,** in the plugin's tables.

### A page is a library document

A page's id is its library item's id, and it never changes. The bot uses it as `library:<id>`, the owner as `/pages/<id>`.

- **Writing** saves it through `fx.library.save`, named `<title>.md` or `<title>.html`, tagged for the bot and chat.
- **Revising** changes that same item through `fx.library.replace`, so the library always holds one row for a page, with the newest text, and it moves to the top.
- **Finding** needs nothing: `library_search` and `library_read` already do it, and a page is under what `library_read` reads, so the bot always sees all of it.
- **Removing the plugin** leaves every page in the library as a document, at its newest version.

So bots need no tool to find or read a page.

### The tools

The two Markdown tools are `safe`, and `pages_html` isn't. None needs a setting.

**`pages_write { title, text, id? }`**

```text
Write a page for the owner to read and keep: a report, a guide, a plan, or a summary of a project.
Use it when they ask for something to keep or come back to, not for a short answer.
It's Markdown, at most 60,000 bytes: headings, tables, code, and images from the library, as
![what it shows](library:<id>). Leave the title out of the text.
To rewrite a page, give its library:<id>. For a small change, use pages_edit.
```

**`pages_edit { id, edits: [{ old_string, new_string }] }`**

```text
Change part of a page you wrote, by its library:<id>, without writing it again. Each old_string must
match exactly once. The edits apply in order and save as one version, or not at all.
library_read shows the page as it stands.
```

**`pages_html { title, html, id? }`**

```text
Write a page as one HTML document, for what Markdown can't do: a chart, filters and controls, or a
designed layout. Use pages_write for everything else, since this costs far more to write.
It's self-contained, at most 60,000 bytes, with its CSS and JavaScript inline, and it can load
nothing: no network, no CDN, and no outside fonts. Images come from the library, as
<img src="library:<id>">. It must read on a phone 375 pixels wide, in light and dark.
Give outside links target="_blank". To change a page, give its library:<id> and the whole document.
```

- **The answer:** `Saved "Trip plan" as library:<id>, version 3. The owner sees a card here that opens it, so don't repeat the page: say in a sentence or two what it covers. Anywhere else, such as a room, link it as [Trip plan](/pages/<id>).`
- **Limits:** a title of 1 to 120 characters on one line, at most 60,000 bytes, and up to 20 edits. That's about 10,000 words of Markdown, and it means a page always fits one read, so there's no paging. For HTML, it leaves no room for a chart library, so a bot draws charts with SVG or a canvas.
- **HTML is rewritten whole.** `pages_edit` on an HTML page answers `library:<id> is HTML, so change it with pages_html.`, so a `safe` tool never touches a page's scripts. A page can change format: each version is what it was.
- **A script that doesn't parse is refused,** saying which, as OpenClaw does. Each inline classic script goes through `new vm.Script()`, which compiles it and runs nothing. It also catches a page cut off partway through a script. A module script isn't judged.
- **Only its bot changes a page.** Another bot gets `No page library:<id> of yours.`, and so does an id that isn't a page.
- **The same text again** changes nothing, and answers the same page. That makes `pages_write` and `pages_html` `idempotent`, so a call cut off by a crash can run again. `pages_edit` isn't: its old string would be gone.
- **Text the library already holds,** which is rare, since each text has one row. `fx.library.save` hands back that item, so a new page with the text of a document a bot saved becomes that item. One with the text of an upload is refused, so a bot can't take over what the owner sent. A revision that matches another item is refused too, naming it.

### Versions

- **One for each turn.** Edits in a turn fold into one, by `call.messageId`, as fx0 keeps each turn's last. Going back means going back to before that request.
- **Every one is kept.** Text is small, and 365 versions of a daily page at the limit are about 20 MB. There's no cap, and so no surprise eviction like OpenClaw's.
- **Restore** makes the old text the newest version, in the chat the newest was written in. Nothing is lost by going back.
- **The newest is in both places:** the library, for search and for surviving the plugin, and `versions`, so the reader has one way to read any version.

### Data (`0001_pages.sql`)

```sql
create table pages (id text primary key, bot text not null);
create table versions (page text not null references pages on delete cascade, n integer not null,
  message_id text, session text not null, title text not null, type text not null, text text not null,
  at timestamptz not null default now(), primary key (page, n));
```

`id` is the library item's. A plugin's tables don't reference core's, so `library.removed` does what a foreign key would: it deletes the row, and its versions go with it. A page the owner deletes leaves no old text behind.

### Routes

| Route | What it does |
| --- | --- |
| `GET /api/plugins/pages/:id` | `{ id, bot, title, at, versions: [{ n, title, at }] }`, newest first. 404 for an item that isn't a page, which is how the library's button knows. |
| `GET /api/plugins/pages/:id/versions/:n` | `{ title, type, text, at }` |
| `GET /api/plugins/pages/:id/versions/:n/frame` | An HTML version as a document, under the headers in [HTML pages](#html-pages). 404 for Markdown. |
| `POST /api/plugins/pages/:id/restore` | `{ n }`: that version again, as the newest. Refused once the bot is gone, since `replace` needs its tag. |

### The card

`app.toolView("write", Card, { open: true })`, and the same for `edit`. It reads the id and version from `call.output`, like `routines`' card.

```text
┌─────────────────────────────────────────┐
│  Trip plan                     [ Open ] │
│  Version 3                              │
└─────────────────────────────────────────┘
```

- **While it runs:** `Writing a page…`, with the title.
- **A later version exists:** `Updated since`, in place of the version, from Grok's **Updated below**. **Open** shows the newest. "Below" would be wrong when the change came from another chat.
- **It failed:** the tool's words.
- **The page was removed:** `This page was removed.`, with no button.

### The reader

`app.route("/:id", Reader)`, at `/pages/<id>`, in the app's frame with the sidebar.

```text
≡  Trip plan
─────────────────────────────────────────────
   ● Scout · Nov 7, 2:14 PM   [ Version 3 ▾ ]
   [ Copy ]  [ Print ]  [ Delete ]
   Open Scout's chat

   Three days in Lisbon, on foot where we can…

   ## Where to stay
   | Area | Why | Nightly |
   …
```

- **Markdown:** Streamdown, in a reading column as wide as a chat, in `static` mode. A first line of `# <title>` isn't drawn twice.
- **HTML:** a frame that fills the rest of the screen, and scrolls inside.
- **Versions:** a `NativeSelect`, there only when a page has more than one. On an older one, a line says `Version 2 of 3, Nov 6` with **Restore** and **Back to the newest**.
- **Images in Markdown:** `library:<id>` becomes the item's file URL. Any other image shows as a link with its alt text, and doesn't load: the owner opened a report, not a request to wherever a bot's sources pointed.
- **Copy** copies the source of the version showing.
- **Print** calls `window.print()` on a Markdown page, with `page.css` showing only the page. The app's frame clips to one screen, so without it a long page prints its first screen only. This is how a page leaves fxbot: Save as PDF. An HTML page has **Open in a tab** in its place, since a sandboxed frame can't print, and the browser prints it from there.
- **Delete** asks as the library does, then calls `client.library.remove`, so there's one way to delete.
- **Open Scout's chat** goes to the bot. A removed bot's page has neither it nor **Restore**, and says `A bot you removed`.
- **A page that's gone:** `This page was removed.`, with a link to the library.

### HTML pages

The frame loads a route, as Pi's does, not `srcdoc`. A header can't be undone by anything in the page, and it holds when the address is opened alone in a tab.

```html
<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        src="/api/plugins/pages/<id>/versions/<n>/frame" title="Trip plan"></iframe>
```

```text
content-security-policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data:; font-src data:; media-src data:; base-uri 'none'; form-action 'none';
  frame-ancestors 'self'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox
x-content-type-options: nosniff
cache-control: no-store
```

- **No way into the app.** `sandbox` without `allow-same-origin` gives it an opaque origin, so it can't read the app's storage or call its API.
- **It loads nothing.** With `default-src 'none'`, no request, script, stylesheet, or font comes from outside. It's stricter than Pi's, like fx0's.
- **Images are embedded.** The route turns `library:<id>` into a `data:` URL, through `fx.library.read`, so only the bot's own items work. Nothing else changes: the rest is what the bot wrote.
- **Links.** One with `target="_blank"` opens a tab, which is why `allow-popups` is there, and it's why the tool says to use it. One without moves the frame, and the browser's back button returns.
- **Controls** change what's on screen, and a reload clears them. As Grok says, "Nothing you do on the page is saved."
- **It isn't sealed.** A script can still move its own frame to another address, with what's on the page in that address, and a CSP doesn't stop that. So `pages_html` isn't `safe`, and a bot on **Ask** waits for the owner.

### The library

- **The list:** a page is a row under **Documents**, named `Trip plan.md` or `Trip plan.html`. It's also on the bot's panel. An HTML page's tile shows the start of its source.
- **The preview** shows Markdown drawn, and HTML as its source, and never runs it. `app.libraryItem` adds **Open page**, which goes to `/pages/<id>`. The part asks the plugin's route, and draws nothing for an item that isn't a page.

### Rooms, routines, and permissions

- **A room** shows no card, so the tool's answer tells the bot to link the page. A link in a reply asks **Open link?** first, as any link does.
- **A routine** can write Markdown pages with nothing added. On **Ask**, `pages_html` in a run leaves a card like any other call: it expires after 30 minutes, and the page isn't written. Its result comes back with the page attached, as anything else it saves.
- **Permissions:** on **Ask**, a Markdown page goes straight through, and `pages_html` waits at a card, with the document folded. On **Auto**, the reviewer sees it as any risky call.
- **Cross-bot messages:** a bot can write a page in a turn another bot started. The card folds into the pill with the rest of the turn.

### The core pieces

**`fx.library.replace({ bot, session, id, name, type, bytes })`**, in `library.ts`. One statement, like `save`:
- It updates `sha256`, `name`, `type`, `size`, `data`, and `text`. `tsv` follows by itself.
- It adds the tag for the bot and chat, or moves it to now, so the item goes to the top of the list.
- It refuses an image, an upload, an item not tagged for the bot, and text another item holds. Uploads stay as the owner sent them.
- It answers the item.

**`library.removed { id }`**, a hook. `fxbot.library.remove` fires it after the delete, to every plugin, since an item has no one bot. It observes, like `turn.end`. `observe` checks a bot, so this one loops as `settings` does.

**`app.libraryItem(Component)`**, in `Preview`, beside **Download**. It gets `item`, and sits in its own error boundary, as every part does.

**The name.** `pages` comes out of `fxbotsOwn`, which is one word. `GET /api/plugins/pages` stays core's, so a plugin of that name can't have a route at its root, and this one doesn't. An older fxbot checks the name first, so it says `plugin.json's name can't be pages`, not **Needs fxbot**. That's a clumsy message, but a clean refusal.

### Cost

- **Idle:** nothing. No process, no timer, no request.
- **In a chat:** three tool descriptions in each turn, about 300 tokens. A plugin's tools reach every bot, so that's on bots it's off for too, and Essentials makes it the default. Nothing in the instructions.
- **A Markdown page:** the model's output, as if it had written it in the chat. An edit costs what it changes.
- **An HTML page:** several times that, and any change rewrites it. On **Auto**, the reviewer reads the call too.
- **Storage:** each version's text in Postgres.
- **In the page:** a few KB, in `page.js`.

### Not in this phase

- **The chat beside the page,** as Grok has on a computer. The owner chose a link to the chat, and a plugin can't embed it today.
- **Small edits to an HTML page.** They'd need a tool that isn't `safe`, and a third way to write. If rewrites cost too much, this comes first.
- **Anything an HTML page loads,** such as a chart library from a CDN, or a font. Claude allows a few hosts. An allowed host is a way out for a page's data.
- **A bot seeing its HTML.** fx0's bots screenshot their work, and OpenClaw's hear runtime errors. Here the only check is that scripts parse.
- **Editing by hand.** The owner asks the bot, as in Grok. It would bring back the revision check.
- **A public link.** fxbot has no login, and a page reaches anyone on the tailnet, as the app does. **Print** is how one goes further.
- **A list of pages, or a Pages filter.** The library is the list, and a button in the sidebar is what the owner took out for Messages.
- **Watching it being written.** libfx sends nothing until the call is whole.
- **Opening a link in a reply without leaving the page.** That's every link's behavior, and a change to the chat, not to pages.
- **One bot changing another's page, renaming by hand, thumbnails, pins, and a review card before saving.** OpenDots' review is for "show me a draft first", and the bot can do that in the chat.

### What changes

| Part | Change | Lines |
| --- | --- | --- |
| `packages/sdk/src/library.ts` | `replace` | about 16 |
| `packages/sdk/src/plugin-api.ts`, `plugins.ts`, `index.ts` | `fx.library.replace`, `library.removed`, the name | about 15 |
| `packages/ui/src/plugins.tsx`, `library.tsx` | `app.libraryItem` | about 5 |
| `plugins/pages/fxbot/server.ts` | The tools, routes, frame, and hook | about 165 |
| `plugins/pages/fxbot/page.jsx`, `page.css` | The card, the reader, the frame, printing, and **Open page** | about 205 |
| `plugins/pages/plugin.json`, its migration | | about 20 |
| `packages/sdk/src/plugins-registry.json` | fxbot's list, and Essentials | 2 |
| `plugins/pages/README.md`, website, `README.md`, `AGENTS.md`, `CHANGELOG.md` | The docs | about 90 |

Size: about 35 core lines, about 390 of the plugin, and about 90 of docs.

## 4. Checklist

Checks use the harness the last phases used: a disposable Postgres, a check server on another port, the mock model, and Playwright at desktop and phone widths, with `FXBOT_PLUGIN_DIRS` pointing at `plugins/pages`. Never against the owner's dev install.

Print a check's setup, and match exact fields: one that tested nothing can't pass.

**The bound:**
- **Size:** at most 45 core lines, and 430 of the plugin, without its README and `page.js`.
- **Out of scope:** [Not in this phase](#not-in-this-phase).
- **If it must be cut,** **Print** goes first, then **Open page** with `app.libraryItem`, then the script check. The tools, the card, the reader, versions, and HTML's isolation stay.

**M1. What the plugin needs from core**
- [x] `fx.library.replace` changes a document's text, name, type, and size under the same id. `library_search` finds the new words, and no longer the old ones.
- [x] The item moves to the top of the library, and a new chat's tag joins the old ones.
- [x] It refuses an image, an upload, an item not tagged for the bot, and text another item holds, each saying why, and the item is unchanged.
- [x] The same text again changes nothing.
- [x] `/api/library/<id>/file` with the old ETag answers the new text, not a 304.
- [x] `library.removed` reaches a plugin that's on for no bots. A handler that throws is logged, and the item is still removed.
- [x] An `app.libraryItem` part draws in the preview from the library and from a bot's panel, and one that throws leaves the preview working.
- [x] A plugin named `pages` adds. `GET /api/plugins/pages` still lists page code, `/api/plugins/pages/<id>` reaches the plugin, and `preview` and `search` are still refused as names.
- [x] `npm run typecheck` passes, and no plugin's name is in core's code.
- [x] A note under `## Unreleased`, and the three additions in the plugin API reference, each with its version.

**M2. The tools**
- [x] `pages_write` with no id makes a page: one `text/markdown` library item named `<title>.md`, tagged for the bot and chat, and version 1.
- [x] With an id, it's the same item, version 2, and still one row in the library.
- [x] `library_search` finds it by a word in it, and `library_read` gives back all of it at the limit, with no cut.
- [x] `pages_edit` applies several edits in order, as one version.
- [x] An old string that matches nothing, or twice, saves nothing and says which one.
- [x] Two writes in one turn make one version, and the next turn makes another.
- [x] Each limit refuses with a message that says what to fix: the title, 60,000 bytes, and 20 edits.
- [x] Another bot's page, an upload, and an id that's no page answer `No page library:<id> of yours.`, and nothing changes.
- [x] A new page with an upload's text is refused, and one with the text of a document a bot saved becomes that item.
- [x] A revision that matches another item is refused, naming it, and the page is unchanged.
- [x] A `pages_write` run twice, as after a crash, leaves one page and one version.
- [x] The answer says not to repeat the page, and gives the link.
- [x] On a bot the plugin is off for, a call fails with `pages is off for this bot.`, and saves nothing.

**M3. Reading**
- [x] The card shows the title and **Open** in a bot's chat, in sight below the folded steps, and it's there after a reload.
- [x] While the call runs, it says `Writing a page…`.
- [x] After a later version, an older card says `Updated since`, and **Open** shows the newest.
- [x] A failed call shows the tool's words, and a removed page's card says so, with no button.
- [x] `/pages/<id>` draws the page: a table and a code block, in a reading column, with the title once.
- [x] A `library:<id>` image draws. An `https:` image makes no request, and shows as a link.
- [x] The version select shows only with more than one. An older version says so, and **Restore** makes it the newest, in the library and in `library_read` too.
- [x] **Copy** copies the Markdown of the version showing.
- [x] A PDF of a page several screens long has all of it, and none of the sidebar.
- [x] **Delete** asks, removes the library item and every version, and the address then says `This page was removed.`
- [x] A removed bot's page still reads, says `A bot you removed`, and has no **Restore** or chat link.
- [x] At 375 pixels, nothing goes sideways on the reader, with a wide table on the page, or on the card.
- [x] No page errors, on any of these.

**M4. HTML pages**
- [x] `pages_html` makes a `text/html` library item named `<title>.html`, at version 1, and with an id, version 2 of the same item.
- [x] A script that doesn't parse is refused, saying which. A module script isn't judged, and no script runs on the server.
- [x] `pages_edit` on an HTML page refuses, naming `pages_html`.
- [x] A page goes from Markdown to HTML and back, and each version draws as what it was.
- [x] The frame draws in the reader, and its script runs: a chart draws, and a filter changes it.
- [x] Inside the frame, `fetch`, `XMLHttpRequest`, a WebSocket, an outside script, stylesheet, image, and font all fail, and a stub server sees no request.
- [x] Inside the frame, `self.origin` is `null`, and `document.cookie`, `localStorage`, and `parent.document` give nothing.
- [x] A form post and a change to `top.location` go nowhere.
- [x] A script can still move its own frame out, which is the reason `pages_html` isn't `safe`, and the reader stays put.
- [x] Opened alone in a tab, the address has the same headers and an opaque origin, and can't reach `/api/profiles`.
- [x] A site that isn't fxbot can't frame it.
- [x] A `library:<id>` image draws as `data:`, and another bot's item doesn't.
- [x] A `target="_blank"` link opens a tab.
- [x] `/frame` answers 404 for a Markdown version.
- [x] The library still sends an HTML page as plain text, and its preview shows the source, with no script running.
- [x] **Open in a tab** prints the whole document.
- [x] A document with no background of its own reads in dark mode.
- [x] At 375 pixels, the frame fills the width, and nothing goes sideways.

**M5. Everywhere else**
- [x] A page shows under **Documents** in the library and on the bot's panel, and its preview has **Open page**. Other items don't.
- [x] Removing an item in the library removes its versions, with no row left in `versions`.
- [x] Removing the plugin drops its schema, and every page stays in the library, at its newest text, and opens in the preview.
- [x] Adding it back works, and a page from before is a plain document.
- [x] With the plugin not added, nothing is different: no tool, route, timer, or part.
- [x] A bot in a room writes a page and links it, and the link opens it, after **Open link?**.
- [x] A routine writes a page, and its result reaches the bot's chat with it attached.
- [x] A bot on **Ask** writes a Markdown page, and edits it, without a card stopping it.
- [x] A bot on **Ask** waits at a card for `pages_html`, with the document folded. **Allow** saves it, and **Deny** saves nothing.
- [x] On **Auto**, the reviewer gets a `pages_html` call.
- [x] A routine's `pages_html` on **Ask** leaves a card, and after it expires, no page exists.
- [x] `pages` is in Essentials, before `computer`: a first run adds it, and it shows in the pack on **Browse**.
- [x] A turn another bot started folds with its page in the pill.
- [x] `scripts/check-plugins.mjs` passes, with `minFxbot` at the release that ships this.

**M6. Docs and closing**
- [x] `plugins/pages/README.md`, with the rolldown command, and `page.js` built and committed.
- [x] `pages` in `plugins-registry.json`, in its `essentials`, and in the site's directory, with the pack's words on the site and in the tutorial still true.
- [x] A how-to on the site, listed in `src/sidebar.ts`, and `npm run build-site` passes.
- [x] `README.md`'s line ticked, `AGENTS.md`'s built scope, and `CHANGELOG.md`.
- [x] This doc moved to `docs/_completed/phases/`, with a **What the build changed**, and the links to it in `library.md` and `routines.md` updated.
- [x] Line counts against the bound.
- [x] `npm run typecheck`, `npm run build`, `npm run build-site`, and `git diff --check` pass, and the regression checks do.
- [x] Committed on the open release branch, core and docs apart, and not pushed.

**The human runs these:**
- **With a real model:** ask for a report on something you care about, then a small change, then a big one. Does it use a page when it should, and stay quiet about what's on it?
- **An HTML page:** ask for a chart with filters. Does it work the first time, on a phone too, and does a real model keep to no outside scripts? Does it pick HTML only when it should?
- **The long wait:** does a bot writing a long page feel stuck?
- **On a phone:** reading a long page, a frame that scrolls inside the reader, and **Print** from the installed app, which may not work on an iPhone.
- **A routine:** a weekly report as a page.
- **After a week:** do you go to the library, or wish for a list of pages?

## 5. Open questions

**Decided by the owner on 2026-11-07:**
- **"HTML too".** Pages are Markdown or HTML. The plan had proposed Markdown alone, with HTML at about 40 lines. It's about 65, with its own tool, so an HTML page can ask first where a Markdown one doesn't.
- **"link in the chat".** No chat beside the page. The card in the chat opens the page, and the reader links back to the chat.
- **"pages are part of the essentials".** `pages` joins the pack, before `computer`, whose setup restarts fxbot.

Nothing is left open.

## What the build changed

- **Mermaid diagrams don't draw in fxbot.** The plan said they would. Streamdown needs a plugin of its own for them, which the app doesn't have, so a Mermaid block shows as code, in the chat too. A browser check caught it. The tool doesn't offer them, and a bot draws a diagram with `pages_html`.
- **The reading column is in `page.css`.** The app's stylesheet holds only the classes it uses, and had no `max-w-2xl`, `pb-3`, `pb-10`, or `bg-white`, so the page first ran edge to edge.
- **`pages` needed a line in `plugins` as well as `essentials`.** The pack leaves out a name that isn't listed, so it was silently missing until the check on a fresh install ran the real flow.
- **A sandbox's origin is `self.origin`.** `location.origin` gives the URL's, even in a sandbox. The checks read the right one, and the page's script got no further in either case.
- **A script can leave, and a check shows it.** It can move its own frame, and alone in a tab, it can move itself. So `pages_html` isn't `safe`, and the plan's reason holds.
- **A link in a reply says too much.** Streamdown's dialog says "Open external link?" and "You're about to visit an external website." for `/pages/<id>` too. It's how every link behaves, so it stayed, as planned. It's a small change to the chat, for later.
- **The size:** a net 37 core lines, against 45, and 417 of the plugin, against 430.
