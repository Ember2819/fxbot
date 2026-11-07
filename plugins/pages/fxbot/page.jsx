// How a page shows in a reply, the screen that reads it, and Open page in the library's preview. Built into page.js; see
// the README.
import { useEffect, useState } from "react";
import { api, client, go, ui, useBots } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(answer.error ?? `HTTP ${res.status}`), { status: res.status });
  return answer;
}

const when = (at) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const frameOf = (id, n) => `/api/plugins/pages/${id}/versions/${n}/frame`;

// The page's version from a call's answer, and the page as it stands now: undefined until read, null if it's gone.
function Card({ call: tool }) {
  const found = /^Saved "(.*)" as library:([0-9a-f]{12}), version (\d+)\./.exec(tool.output ?? "");
  const id = found?.[2];
  const [page, setPage] = useState();
  useEffect(() => {
    if (id) call(id).then(setPage, () => setPage(null));
  }, [id]);
  if (!tool.done) return <p className="text-sm text-muted-foreground">Writing a page…{tool.input?.title ? ` ${tool.input.title}` : ""}</p>;
  if (!id) return <p className="text-sm text-muted-foreground">{tool.error ?? tool.output}</p>;
  if (page === null) return <p className="text-sm text-muted-foreground">This page was removed.</p>;
  const version = Number(found[3]);
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{page?.title ?? JSON.parse(`"${found[1]}"`)}</p>
        <p className="text-muted-foreground">{page && page.versions[0].n > version ? "Updated since" : `Version ${version}`}</p>
      </div>
      <ui.Button size="sm" variant="outline" onClick={() => go(`/pages/${id}`)}>Open</ui.Button>
    </div>
  );
}

// An image from the library draws. Any other shows as a link, and doesn't load: a page is for reading, and opening one
// shouldn't reach wherever its sources pointed.
function Picture({ src, alt }) {
  if (String(src).startsWith("/api/library/")) return <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg" />;
  return <a href={src} target="_blank" rel="noreferrer" className="underline underline-offset-4">{alt || src}</a>;
}

function Markdown({ title, text }) {
  const body = text.replace(/^\s*#[ \t]+(.+)\n/, (line, heading) => (heading.trim() === title ? "" : line)).replace(/\]\(library:([0-9a-f]{12})/g, "](/api/library/$1/file");
  return (
    <div className="pages-scroll min-h-0 flex-1 overflow-y-auto">
      <article className="pages-column pages-print">
        <h1 className="pages-title">{title}</h1>
        <ui.Streamdown mode="static" components={{ img: Picture }}>{body}</ui.Streamdown>
      </article>
    </div>
  );
}

function Reader({ params: { id } }) {
  const { Button, Blob, Header, NativeSelect } = ui;
  const [page, setPage] = useState();
  const bot = useBots()?.find((b) => b.id === page?.bot);
  const [picked, setPicked] = useState(null);
  const [shown, setShown] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const read = () => call(id).then(setPage, (e) => (e.status === 404 ? setPage(null) : setError(e.message)));
  useEffect(() => void read(), [id]);
  const newest = page?.versions[0].n;
  const n = picked ?? newest;
  useEffect(() => {
    if (n) call(`${id}/versions/${n}`).then(setShown, (e) => setError(e.message));
  }, [id, n]);

  if (page === null)
    return (
      <>
        <Header title="Page" />
        <div className="pages-column grid gap-3 text-sm">
          <p>This page was removed.</p>
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => go("/library")}>Open the library</Button>
        </div>
      </>
    );
  if (!page || !shown) return <Header title={error || "Page"} />;

  const isHtml = shown.type === "text/html";
  const restore = () => call(`${id}/restore`, "POST", { n }).then(() => (setPicked(null), read()), (e) => setError(e.message));
  const remove = async () => {
    if (!confirm(`Remove ${shown.title} from the library, for every bot? The chats it came from keep what the bots saw.`)) return;
    await client.library.remove(id).then(() => go("/library"), (e) => setError(e.message));
  };
  const copy = () => navigator.clipboard.writeText(shown.text).then(() => setCopied(true), (e) => setError(e.message));
  return (
    <>
      <Header title={shown.title} />
      <div className="pages-column pages-bar grid gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {bot && <Blob shape={bot.shape} color={bot.color} size={20} />}
          <span className="min-w-0 text-muted-foreground">{bot ? bot.name : "A bot you removed"} · {when(shown.at)}</span>
          {page.versions.length > 1 && (
            <NativeSelect aria-label="Version" value={n} onChange={(e) => setPicked(Number(e.target.value))}>
              {page.versions.map((v) => <option key={v.n} value={v.n}>Version {v.n}</option>)}
            </NativeSelect>
          )}
        </div>
        {n !== newest && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Version {n} of {newest}, {when(shown.at)}</span>
            {bot && <Button size="sm" onClick={restore}>Restore</Button>}
            <Button size="sm" variant="outline" onClick={() => setPicked(null)}>Back to the newest</Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
          {isHtml ? <Button size="sm" variant="outline" onClick={() => window.open(frameOf(id, n), "_blank", "noreferrer")}>Open in a tab</Button> : <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>}
          <Button size="sm" variant="outline" onClick={remove}>Delete</Button>
          {bot && <Button size="sm" variant="ghost" onClick={() => go(`/profiles/${bot.id}`)}>Open {bot.name}'s chat</Button>}
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </div>
      {isHtml ? (
        <iframe key={n} title={shown.title} src={frameOf(id, n)} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" className="pages-frame min-h-0 w-full flex-1 border-0" />
      ) : (
        <Markdown title={shown.title} text={shown.text} />
      )}
    </>
  );
}

// Open page, on the items that are pages.
function OpenPage({ item }) {
  const [page, setPage] = useState(false);
  useEffect(() => {
    if (item.kind === "document") call(item.id).then(() => setPage(true), () => {});
  }, [item.id]);
  return page ? <ui.Button variant="outline" onClick={() => go(`/pages/${item.id}`)}>Open page</ui.Button> : null;
}

export default function setup(app) {
  app.route("/:id", Reader);
  app.toolView("write", Card, { open: true });
  app.toolView("edit", Card, { open: true });
  app.toolView("html", Card, { open: true });
  app.libraryItem(OpenPage);
}
