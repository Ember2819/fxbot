import { Marked } from "marked";
import { copyButton } from "./code.tsx";
import { href, repo } from "./site.ts";

export type Heading = { id: string; text: string };

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
// GitHub's anchors: lower case, punctuation dropped, each space a hyphen.
const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");

// `/docs/x/` is a page of this site, `#x` a heading, and any other relative link a file in the repository, as
// CHANGELOG.md and the README link them.
function url(link: string) {
  if (/^[a-z][a-z+.-]*:/i.test(link) || link.startsWith("#")) return link;
  if (link.startsWith("/")) return href(link);
  return `${repo}/blob/main/${link.replace(/^\.\//, "")}`;
}

// A shell line's comment, from a # that starts a word outside quotes, is dimmed.
function shell(text: string) {
  return text
    .split("\n")
    .map((line) => {
      let quote = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) quote = c === quote ? "" : quote;
        else if (c === "'" || c === '"') quote = c;
        else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return `${escape(line.slice(0, i))}<span class="comment">${escape(line.slice(i))}</span>`;
      }
      return escape(line);
    })
    .join("\n");
}

// One page of Markdown: its HTML, the text of its first heading and paragraph, and its second-level headings for
// "On this page".
export function markdown(source: string) {
  const headings: Heading[] = [];
  const taken = new Set<string>();
  let title = "";
  let description = "";
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const text = plain(html);
        if (depth === 1) {
          title ||= text;
          return `<h1>${html}</h1>\n`;
        }
        let id = slug(text);
        for (let n = 1; taken.has(id); n++) id = `${slug(text)}-${n}`;
        taken.add(id);
        if (depth === 2) headings.push({ id, text });
        return `<h${depth} id="${id}"><a href="#${id}">${html}</a></h${depth}>\n`;
      },
      paragraph({ tokens }) {
        const html = this.parser.parseInline(tokens);
        description ||= plain(html).replace(/\s+/g, " ");
        return `<p>${html}</p>\n`;
      },
      link({ href: link, title: hint, tokens }) {
        return `<a href="${escape(url(link))}"${hint ? ` title="${escape(hint)}"` : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        const body = lang === "sh" ? shell(text) : escape(text);
        return `<div class="code" data-code><pre><code>${body}</code></pre>${copyButton}</div>\n`;
      },
    },
  });
  const html = marked.parse(source, { async: false });
  if (!title) throw new Error(`A page needs a # heading: ${source.slice(0, 60)}`);
  return { title, description, html, headings };
}
