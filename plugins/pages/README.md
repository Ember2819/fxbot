# pages

A plugin for [fxbot](https://fxbot.sh): a bot writes something to keep, and you read it outside the chat, such as a report, a guide, a plan, or a summary of a project.

- **In the chat,** a card with the page's title and **Open**, and a sentence from the bot.
- **To read,** the page fills the screen at `/pages/<id>`, on a phone too, with **Copy**, **Print**, and **Delete**.
- **In the library,** under **Documents**, where **Open page** opens it. A bot finds pages with `library_search`, and reads them with `library_read`.
- **Every version,** one for each turn. Pick one on the page, and **Restore** makes it the newest.
- **Ticks that stay.** A task list has boxes you tick, and the bot sees them.
- **A page that remembers.** An HTML page saves what you do on it, and a bot sends it numbers without rewriting it.
- **A way back to the bot.** A button on a page drafts a message for you to send.

Add it from **Plugins**, or with **Essentials**. It needs fxbot 0.7.0 or newer. It runs inside fxbot: read its code there before you add it. Removing it leaves each page in the library as a document, at its newest version, and its older versions go.

## A page

A page is a document in the library, of type `text/markdown` or `text/html`. Its id is the item's, and it never changes: the bot uses `library:<id>`, and you use `/pages/<id>`. Writing changes that same item, through `fx.library.replace`, so the library always holds one row for a page.

Only the bot that wrote a page changes its layout. To change one, you ask the bot. You leave marks on it too: a tick, or what an HTML page saves.

| Layer | What it is | Who changes it | Versions |
| --- | --- | --- | --- |
| Layout | The Markdown or HTML | The bot, and a tick | Yes |
| Data | One JSON value | A bot or a routine | No, the latest only |
| Saved | What an HTML page saved | The page | No |

Data and saved belong to the page, not a version, so a rewrite or **Restore** keeps them.

## Ticks

A task list in Markdown (`- [ ] Book flights`) draws as boxes. A tick changes `[ ]` to `[x]` in the page's own text, through `fx.library.replace`, so `library_read`, search, **Print**, and **Copy** all show it, and it stays if the plugin is removed. A run of ticks is one version, until the bot's next write. A tick against an older version, or on a removed bot's page, is off.

## Tools

| Tool | What it does |
| --- | --- |
| `pages_write` | A new Markdown page, or with an `id`, the whole of one again |
| `pages_edit` | Exact replacements in a Markdown page, up to 20, saved as one version or not at all |
| `pages_html` | A new HTML page, or with an `id`, the whole of one again |
| `pages_data` | Sends an HTML page its data, or with no `data`, reads it, and what the page saved |

- A title is one line of up to 120 characters. A page is at most 60,000 bytes, which is under what `library_read` reads, so a bot always sees all of it.
- `pages_write` and `pages_edit` are `safe`, since a page of text is the bot's own, and reaches no one. `pages_html` isn't: on **Ask**, it waits for you. `pages_data` is `safe`, since it checks for your approval itself, so a routine can run it with no one there.
- The same text again changes nothing, and answers the same page.
- A new page with the text of a document a bot saved becomes that item. One with the text of something you sent is refused, and so is a revision that matches another item.
- Markdown images come from the library, as `![what it shows](library:<id>)`. Any other shows as a link, and doesn't load.
- A Mermaid block shows as code. fxbot doesn't draw diagrams in Markdown, so a bot draws one with `pages_html`.

## HTML pages

For what Markdown can't do, such as a chart with filters, or a designed layout. An HTML page is rewritten whole, with no small edits, and the bot can't see how it looks. `pages_html` refuses a page whose inline scripts don't parse, without running them.

It runs in a frame, from `/api/plugins/pages/<id>/versions/<n>/frame`, in a sandbox with no same-origin access, inside a small `shell` page. Everything is inline, so a bot draws charts itself, and `library:<id>` images are embedded before it's served, from the bot's own library.

- What you do with its controls isn't saved, and a reload clears it.
- A link shows its whole address in a bar above the page, and **Open** opens it in a tab.
- **Open in a tab** opens the page alone, to print. It has no line to fxbot there, so it shows no saved things or data.
- A page's errors show below it, with **Tell the bot**. Nothing reaches a bot by itself.

`shim.js` goes first in each page, and is its line to the reader. A page gets:

```js
await fxpage.get(key);          // a value this page saved, or null
await fxpage.set(key, value);   // JSON, at most 64 KiB, and 1 MiB a page
await fxpage.del(key);
await fxpage.list(prefix);      // the keys
await fxpage.data();            // what a bot sent with pages_data, or null
fxpage.on("data", draw);        // it changed
fxpage.open(url);               // you decide, in a bar
fxpage.say(text);               // you read it, and send it, in a bar
```

Every check is on the reader's side, and a page's id and version come from the reader, never from a message. The reader takes the first line a frame offers, and cuts it on a second load.

**Data needs your approval.** A page with code can send what it holds elsewhere, so a bot's data reaches one only if you approved that page's exact text. `pages_data` on a page you haven't approved keeps the value waiting, and a bar on the page asks you. **Allow** approves that text, and the value arrives, with nothing to run again. New text asks again.

**What a page says** goes to the bot's own chat only when you press **Send**, marked as from the page. It's a plugin's turn, not your word, so a risky tool still asks. Text that starts with `/` is refused, and so is text over 4,000 characters.
- In the library, an HTML page shows its source, and doesn't run.

## Tables

- `pages`: each page, by its library item's id, and the bot that wrote it
- `versions`: each version's title, type, and text, with its chat and turn
- `saved`: what each HTML page saved

`pages` also holds a page's data, what's waiting for your approval, and the hash of the text you approved. A plugin's tables don't point at core's, so `library.removed` deletes a page's rows when you delete it.

## Cost

- **Idle:** nothing. No process, no timer, and no request.
- **In a chat:** four tool descriptions in each turn, on every bot, about 450 tokens. A plugin's tools reach every bot, and a call from one it's off for fails.
- **A Markdown page:** the model's output, as if it had written it in the chat. An edit costs what it changes.
- **An HTML page:** several times that, and any change rewrites it. On **Auto**, the reviewer reads the call too.
- **New numbers:** about 150 tokens with `pages_data`, where a rewrite can be 17,000.

## Files

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages. It bundles nothing else. Rebuild it after changing `page.jsx`, from this folder:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --no-comments --file fxbot/page.js
```
