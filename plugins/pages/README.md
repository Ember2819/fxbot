# pages

A plugin for [fxbot](https://fxbot.sh): a bot writes something to keep, and you read it outside the chat, such as a report, a guide, a plan, or a summary of a project.

- **In the chat,** a card with the page's title and **Open**, and a sentence from the bot.
- **To read,** the page fills the screen at `/pages/<id>`, on a phone too, with **Copy**, **Print**, and **Delete**.
- **In the library,** under **Documents**, where **Open page** opens it. A bot finds pages with `library_search`, and reads them with `library_read`.
- **Every version,** one for each turn. Pick one on the page, and **Restore** makes it the newest.

Add it from **Plugins**, or with **Essentials**. It needs fxbot 0.7.0 or newer. It runs inside fxbot: read its code there before you add it. Removing it leaves each page in the library as a document, at its newest version, and its older versions go.

## A page

A page is a document in the library, of type `text/markdown` or `text/html`. Its id is the item's, and it never changes: the bot uses `library:<id>`, and you use `/pages/<id>`. Writing changes that same item, through `fx.library.replace`, so the library always holds one row for a page.

Only the bot that wrote a page changes it. To change one, you ask the bot.

## Tools

| Tool | What it does |
| --- | --- |
| `pages_write` | A new Markdown page, or with an `id`, the whole of one again |
| `pages_edit` | Exact replacements in a Markdown page, up to 20, saved as one version or not at all |
| `pages_html` | A new HTML page, or with an `id`, the whole of one again |

- A title is one line of up to 120 characters. A page is at most 60,000 bytes, which is under what `library_read` reads, so a bot always sees all of it.
- `pages_write` and `pages_edit` are `safe`, since a page of text is the bot's own, and reaches no one. `pages_html` isn't: on **Ask**, it waits for you.
- The same text again changes nothing, and answers the same page.
- A new page with the text of a document a bot saved becomes that item. One with the text of something you sent is refused, and so is a revision that matches another item.
- Markdown images come from the library, as `![what it shows](library:<id>)`. Any other shows as a link, and doesn't load.
- A Mermaid block shows as code. fxbot doesn't draw diagrams in Markdown, so a bot draws one with `pages_html`.

## HTML pages

For what Markdown can't do, such as a chart with filters, or a designed layout. An HTML page is rewritten whole, with no small edits, and the bot can't see how it looks. `pages_html` refuses a page whose inline scripts don't parse, without running them.

It runs in a frame, from `/api/plugins/pages/<id>/versions/<n>/frame`, in a sandbox with no same-origin access, under a CSP that loads nothing from outside. So everything is inline, a bot draws charts itself, and `library:<id>` images are embedded before it's served, from the bot's own library.

- What you do with its controls isn't saved, and a reload clears it.
- A link with `target="_blank"` opens a tab. One without moves the frame.
- **Open in a tab** opens it alone, to print.
- In the library, an HTML page shows its source, and doesn't run.

## Tables

- `pages`: each page, by its library item's id, and the bot that wrote it
- `versions`: each version's title, type, and text, with its chat and turn

A plugin's tables don't point at core's, so `library.removed` deletes a page's rows when you delete it.

## Cost

- **Idle:** nothing. No process, no timer, and no request.
- **In a chat:** three tool descriptions in each turn, on every bot, about 300 tokens. A plugin's tools reach every bot, and a call from one it's off for fails.
- **A Markdown page:** the model's output, as if it had written it in the chat. An edit costs what it changes.
- **An HTML page:** several times that, and any change rewrites it. On **Auto**, the reviewer reads the call too.

## Files

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages. It bundles nothing else. Rebuild it after changing `page.jsx`, from this folder:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --no-comments --file fxbot/page.js
```
