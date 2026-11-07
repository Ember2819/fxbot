// How a page shows in a reply, the screen that reads it, and Open page in the library's preview. Built into page.js; see
// the README.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, client, go, ui, useBots } from "@fxbot/app";

async function call(path, method = "GET", body) {
  const res = await api(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(answer.error ?? `HTTP ${res.status}`), { status: res.status });
  return answer;
}

const when = (at) => new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const frameOf = (id, n, part = "frame") => `/api/plugins/pages/${id}/versions/${n}/${part}`;

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

// The lines of a page's text that are tasks, outside code blocks, in the order their boxes draw.
function taskLines(text) {
  const tasks = [];
  let fence = null;
  text.split("\n").forEach((line, i) => {
    const mark = /^\s*(```+|~~~+)/.exec(line)?.[1];
    if (mark) fence = !fence ? mark : mark.startsWith(fence) ? null : fence;
    else if (!fence && /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line)) tasks.push(i);
  });
  return tasks;
}

function Markdown({ title, text, onTick }) {
  const body = text.replace(/^\s*#[ \t]+(.+)\n/, (line, heading) => (heading.trim() === title ? "" : line)).replace(/\]\(library:([0-9a-f]{12})/g, "](/api/library/$1/file");
  const live = Boolean(onTick);
  const components = useMemo(() => ({ img: Picture, input: ({ checked, type }) => <input type={type} checked={Boolean(checked)} disabled={!live} onChange={() => {}} className="pages-box" /> }), [live]);
  const tick = (event) => {
    if (!live || event.target.type !== "checkbox") return;
    const boxes = [...event.currentTarget.querySelectorAll('input[type="checkbox"]')];
    const tasks = taskLines(text);
    if (boxes.length === tasks.length) onTick(tasks[boxes.indexOf(event.target)], event.target.checked);
  };
  return (
    <div className="pages-scroll min-h-0 flex-1 overflow-y-auto">
      <article className="pages-column pages-print" onClick={tick}>
        <h1 className="pages-title">{title}</h1>
        <ui.Streamdown mode="static" components={components}>{body}</ui.Streamdown>
      </article>
    </div>
  );
}

// What a page asks for, in a bar outside its frame. A button waits half a second, so a page can't time one under a click
// already coming.
function Bar({ words, detail, yes, no, onYes, onNo }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const later = setTimeout(() => setArmed(true), 500);
    return () => clearTimeout(later);
  }, []);
  return (
    <div className="pages-column">
      <div className="grid gap-2 rounded-lg border p-3 text-sm">
        <p>{words}</p>
        {detail && <p className="break-words text-muted-foreground">{detail}</p>}
        <div className="flex flex-wrap gap-2">
          <ui.Button size="sm" disabled={!armed} onClick={onYes}>{yes}</ui.Button>
          <ui.Button size="sm" variant="outline" onClick={onNo}>{no}</ui.Button>
        </div>
      </div>
    </div>
  );
}

// An HTML page, in the shell that holds it. Its line to the reader is the first one it offers: a frame's `origin` and
// `source` can't tell the page from whatever it moved itself to, so a second offer is ignored, and a second load cuts the
// line. Everything else about a message is untrusted.
function Frame({ id, n, title, onOp, data }) {
  const shell = useRef(null);
  const line = useRef(null);
  const taken = useRef(false);
  const ops = useRef(onOp);
  ops.current = onOp;
  useLayoutEffect(() => {
    const offer = (event) => {
      if (taken.current || event.data?.fxpage !== 1 || !event.ports[0] || event.source !== shell.current?.contentWindow?.frames[0]) return;
      taken.current = true;
      line.current = event.ports[0];
      line.current.onmessage = ({ data }) => {
        const { id: call, op, args } = data ?? {};
        if (!Number.isSafeInteger(call) || !Array.isArray(args)) return;
        const answer = (body) => line.current?.postMessage({ id: call, ...body });
        Promise.resolve()
          .then(() => ops.current(op, args))
          .then((value) => answer({ ok: true, value }), (e) => answer({ ok: false, error: e.message }));
      };
    };
    addEventListener("message", offer);
    return () => (removeEventListener("message", offer), line.current?.close());
  }, []);
  useEffect(() => void line.current?.postMessage({ event: "data", value: data?.data ?? null }), [data?.at]);
  const held = (event) => event.target.contentDocument?.querySelector("iframe")?.addEventListener("load", () => (line.current?.close(), (line.current = null)));
  return <iframe ref={shell} title={title} src={frameOf(id, n, "shell")} onLoad={held} referrerPolicy="no-referrer" className="pages-frame min-h-0 w-full flex-1 border-0" />;
}

function Reader({ params: { id } }) {
  const { Button, Blob, Header, NativeSelect } = ui;
  const [page, setPage] = useState();
  const bot = useBots()?.find((b) => b.id === page?.bot);
  const [picked, setPicked] = useState(null);
  const [shown, setShown] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [bar, setBar] = useState(null);
  const [fresh, setFresh] = useState(0);
  const [data, setData] = useState(null);
  const [notNow, setNotNow] = useState(false);
  const [errors, setErrors] = useState([]);
  const ticking = useRef(false);
  const read = () => call(id).then(setPage, (e) => (e.status === 404 ? setPage(null) : setError(e.message)));
  useEffect(() => void read(), [id]);
  const newest = page?.versions[0].n;
  const n = picked ?? newest;
  useEffect(() => {
    if (n) call(`${id}/versions/${n}`).then(setShown, (e) => setError(e.message));
  }, [id, n, fresh]);
  // Data comes when the reader reads again: on opening, and on coming back to the page.
  const isHtml = shown?.type === "text/html";
  const readData = () => (isHtml && n === shown?.n ? call(`${id}/data?n=${n}`).then(setData, () => {}) : undefined);
  useEffect(() => {
    void readData();
    const again = () => document.visibilityState === "visible" && readData();
    addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => (removeEventListener("focus", again), document.removeEventListener("visibilitychange", again));
  }, [id, n, isHtml, shown?.n]);

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

  const restore = () => call(`${id}/restore`, "POST", { n }).then(() => (setPicked(null), read()), (e) => setError(e.message));
  const remove = async () => {
    if (!confirm(`Remove ${shown.title} from the library, for every bot? The chats it came from keep what the bots saw.`)) return;
    await client.library.remove(id).then(() => go("/library"), (e) => setError(e.message));
  };
  const copy = () => navigator.clipboard.writeText(shown.text).then(() => setCopied(true), (e) => setError(e.message));
  // One tick at a time, each against the version the last one answered.
  const tick = (line, done) => {
    if (ticking.current) return;
    ticking.current = true;
    call(`${id}/tick`, "POST", { n, line, done })
      .catch((e) => setError(e.message))
      .then(read)
      .then(() => setFresh((f) => f + 1))
      .finally(() => (ticking.current = false));
  };
  const say = (text) => {
    if (!bot) throw new Error("The bot that wrote this page is gone.");
    if (typeof text !== "string" || !text.trim() || text.length > 4000 || text.trimStart().startsWith("/")) throw new Error("A page can't say that.");
    setBar({
      words: `This page wants to tell ${bot.name}:`,
      detail: text,
      yes: "Send",
      no: "Cancel",
      onYes: () =>
        call(`${id}/say`, "POST", { text }).then(
          () => setBar({ words: `Sent to ${bot.name}.`, yes: `Open ${bot.name}'s chat`, no: "Close", onYes: () => go(`/profiles/${bot.id}`) }),
          (e) => (setError(e.message), setBar(null)),
        ),
    });
  };
  const saved = (op, key, value) => call(`${id}/saved`, "POST", { op, key, value }).then((answer) => answer.value);
  // What a page can ask for, as a fixed list. Its id, version, and bot come from here, never from a message.
  const ops = {
    get: (key) => saved("get", key),
    set: (key, value) => saved("set", key, value),
    del: (key) => saved("del", key),
    list: (prefix) => saved("list", prefix),
    data: () => call(`${id}/data?n=${n}`).then((answer) => answer.data),
    say,
    error: (words) => setErrors((all) => [...all, String(words).slice(0, 4000)].slice(-20)),
    open(address) {
      const url = URL.canParse(address) ? new URL(address) : null;
      if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("That address can't be opened.");
      setBar({ words: "This page wants to open:", detail: url.href, yes: "Open", no: "Cancel", onYes: () => (window.open(url.href, "_blank", "noopener,noreferrer"), setBar(null)) });
    },
  };
  const onOp = (op, args) => {
    if (!Object.hasOwn(ops, op)) throw new Error("A page can't do that.");
    return ops[op](...args);
  };
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
      {bar && <Bar {...bar} onNo={() => setBar(null)} />}
      {!bar && data?.waiting && !notNow && n === newest && (
        <Bar
          words={`${bot?.name ?? "A bot"} wants to give this page data. A page with code can send what it holds elsewhere.`}
          yes="Allow"
          no="Not now"
          onYes={() => call(`${id}/allow`, "POST", { n }).then(readData, (e) => setError(e.message))}
          onNo={() => setNotNow(true)}
        />
      )}
      {isHtml ? (
        <Frame key={n} id={id} n={n} title={shown.title} onOp={onOp} data={data} />
      ) : (
        <Markdown title={shown.title} text={shown.text} onTick={bot && n === newest ? tick : null} />
      )}
      {errors.length > 0 && (
        <div className="pages-column pages-bar flex flex-wrap items-center gap-2 pt-2 text-sm">
          <span className="text-muted-foreground">This page hit an error.</span>
          {bot && <Button size="sm" variant="outline" onClick={() => say(`This page hit an error:\n\n${errors.join("\n").slice(0, 3900)}`)}>Tell the bot</Button>}
        </div>
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
