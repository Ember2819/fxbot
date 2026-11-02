import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Addon, AddonCard, AddonFrom, AddonInfo, AddonPreview, AddonRef, AddonSearch } from "@fxbot/sdk/client";
import { client } from "./client.ts";

export const label = "grid gap-1.5 text-sm font-medium";
export const hint = "font-normal text-muted-foreground";
export const heading = "text-sm font-medium";
export const signsIn = { none: "No sign-in", headers: "A key in a header", oauth: "Signs in with OAuth" };
export const hostOf = (url: string) => (URL.canParse(url) ? new URL(url).host : url);
// A key without a scheme is a bearer token. "Bearer …" and "Token …" go as written.
export const bearer = (key: string) => (/\s/.test(key.trim()) ? key.trim() : `Bearer ${key.trim()}`);
// A key goes in Authorization, unless it is written as a header of its own, such as "X-Api-Key: …".
function keyHeader(key: string): [string, string] {
  const named = /^([A-Za-z][A-Za-z0-9-]*):\s+(\S.*)$/.exec(key.trim());
  return named ? [named[1], named[2]] : ["Authorization", bearer(key)];
}
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
// Where an entry comes from: fxbot's own list stands out, and a registry is named.
const fromLabel: Record<AddonFrom, string> = { fxbot: "fxbot", github: "GitHub registry", official: "Official registry" };
const fromText: Record<AddonFrom, string> = { fxbot: "fxbot's list", github: "GitHub's registry", official: "The official registry, unmoderated" };

// The registry's search for the page's words, once typing stops. The official registry is asked once per search.
export function useSearch(query: string, everything: boolean) {
  const [result, setResult] = useState<AddonSearch | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let stopped = false;
    setBusy(true);
    const wait = setTimeout(
      () =>
        client.addons
          .search(query, { kind: "mcp", everything })
          .then((found) => !stopped && (setResult(found), setError("")), (e: Error) => !stopped && setError(e.message))
          .finally(() => !stopped && setBusy(false)),
      query ? 250 : 0,
    );
    return () => ((stopped = true), clearTimeout(wait));
  }, [query, everything]);
  return { result, error, busy };
}

// The MCP tab: fxbot's list and GitHub's registry as cards, the switch to search everything, and adding by address.
// `added` holds the names and addresses of what is installed.
export function Results({ search, everything, onEverything, added, onOpen, onAddress }: { search: ReturnType<typeof useSearch>; everything: boolean; onEverything: (on: boolean) => void; added: Set<string>; onOpen: (card: AddonCard) => void; onAddress: () => void }) {
  const { result, error } = search;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={everything} onCheckedChange={(on) => onEverything(on === true)} />
          Search everything <span className={hint}>unmoderated</span>
        </label>
        <Button variant="link" size="sm" className="px-0" onClick={onAddress}>
          Add by address
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && !result.syncedAt && <p className="text-sm text-muted-foreground">fxbot hasn't read GitHub's registry yet{result.error ? `: ${result.error}` : ". It does within a minute of starting."}</p>}
      {result?.syncedAt && result.error && <p className="text-sm text-muted-foreground">The last sync failed ({result.error}), so these are from {new Date(result.syncedAt).toLocaleString()}.</p>}
      {result?.everythingError && <p className="text-sm text-destructive">{result.everythingError}</p>}
      {result?.cards.map((card) => <Card key={`${card.from}:${card.name}`} card={card} added={added.has(card.name) || (card.url !== undefined && added.has(card.url))} onOpen={() => onOpen(card)} />)}
      {result?.syncedAt && result.cards.length === 0 && (
        <p className="text-sm text-muted-foreground">No server matches{everything ? "." : " in fxbot's list or GitHub's registry. Search everything to look in the official one."}</p>
      )}
    </div>
  );
}

// The add-on's initial, in place of a remote icon, which would tell its host who looked.
const Initial = ({ title }: { title: string }) => (
  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted font-medium">
    {(title.trim()[0] ?? "?").toUpperCase()}
  </span>
);

// What a card says under its description: where it runs, what it needs, and anything to be wary of.
function facts(card: AddonCard, added: boolean) {
  return [
    <Badge key="from" variant={card.from === "fxbot" ? "default" : "outline"}>
      {fromLabel[card.from]}
    </Badge>,
    added && <span key="added" className="text-foreground">Added</span>,
    card.host && (card.hostMatches === false ? <span key="host" className="text-destructive">{card.host}, not on {card.domain}</span> : <span key="host">{card.host}</span>),
    card.local && <span key="local">Runs on this machine</span>,
    card.needs === "key" && <span key="key">Needs a key</span>,
    card.status === "deprecated" && <span key="deprecated" className="text-destructive">Deprecated</span>,
  ].filter(Boolean);
}

function Card({ card, added, onOpen }: { card: AddonCard; added: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full min-w-0 gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50">
      <Initial title={card.title} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="max-w-[70%] shrink-0 truncate font-medium">{card.title}</span>
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{card.name}</span>
          {card.stars !== undefined && <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">★ {compact(card.stars)}</span>}
        </span>
        {card.description && <span className="line-clamp-2 text-sm text-muted-foreground">{card.description}</span>}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{facts(card, added)}</span>
      </span>
    </button>
  );
}

// An entry's Information: who published it, where it comes from, and its registry's notes.
export function Information({ info }: { info: AddonInfo }) {
  const link = (url?: string) => (url && /^https?:\/\//.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">{url.replace(/^https?:\/\//, "")}</a> : url);
  const rows: [string, ReactNode][] = [
    ["Publisher", <span key="ns" className="font-mono text-xs">{info.namespace}</span>],
    ["Version", info.version],
    ["Repository", link(info.repository)],
    ["Website", link(info.website)],
    ["License", info.license],
    ["Stars", info.stars === undefined ? undefined : info.stars.toLocaleString()],
    ["Status", info.status === "active" ? "Active" : info.status === "deprecated" ? "Deprecated" : "Removed"],
    ["Source", fromText[info.from]],
  ];
  return (
    <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {rows
        .filter(([, value]) => value !== undefined && value !== "")
        .map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

// A registry entry's page, and the consent to add it. It looks at the server first; nothing is saved before Add, and
// an entry that changed since is shown again.
export function EntryDialog({ card, onAdded, onClose }: { card: AddonCard; onAdded: (addon: Addon) => void; onClose: () => void }) {
  const [allowLocal, setAllowLocal] = useState(false);
  const [page, setPage] = useState<AddonPreview | null>(null);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ref: AddonRef = { registry: card.name, allowLocal, from: card.from };
  const look = () => (setPage(null), client.addons.preview(ref).then(setPage, (e: Error) => setError(e.message)));
  useEffect(() => void (setError(""), look()), [allowLocal]);
  const info = page?.info ?? card;

  async function add() {
    setBusy(true);
    setError("");
    try {
      let addon = await client.addons.add(ref, page!.hash);
      const filled = Object.entries(values).filter(([, value]) => value.trim());
      if (filled.length) addon = await client.addons.setSecrets(addon.id, { headers: Object.fromEntries(filled.map(([name, value]) => [name, name === "Authorization" ? bearer(value) : value.trim()])) });
      onAdded(addon);
    } catch (e) {
      setError((e as Error).message);
      // The entry changed since its page was shown: show the page again.
      if ((e as Error).message.includes("changed since")) await look();
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2 pr-6">
            <Initial title={info.title} />
            <DialogTitle className="truncate">{info.title}</DialogTitle>
          </div>
          {info.description && <DialogDescription>{info.description}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4">
          {card.hostMatches === false && (
            <p className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                Its server is at {card.host}, which isn't on {card.domain}, the publisher's domain. A namespace says who published an entry, not that the server is theirs.
              </span>
            </p>
          )}
          {!page && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> Looking at the server
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {(allowLocal || error.includes("is a local address")) && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={allowLocal} onCheckedChange={(checked) => setAllowLocal(checked === true)} />
              <span>
                Allow a local address <span className={hint}>Only for a server you run: it can then reach this machine and your private network.</span>
              </span>
            </label>
          )}
          {page?.local && (
            <section className="grid gap-1">
              <h3 className={heading}>Runs on this machine</h3>
              <p className="text-sm text-muted-foreground">{info.title} runs as a program on this machine, which comes with plugins. It can't be added yet.</p>
            </section>
          )}
          {page && !page.local && (
            <section className="grid gap-2">
              <h3 className={heading}>MCP server</h3>
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{page.name}</p>
                <p className="text-muted-foreground">
                  {hostOf(page.url)} · {signsIn[page.auth]} · {page.tools ? `${page.tools.length} tools, ${page.tools.filter((t) => t.readOnly).length} read-only` : "lists its tools once added"}
                </p>
              </div>
              {page.auth === "headers" &&
                page.headers.map((h) => (
                  <label key={h.name} className={label}>
                    {h.name === "Authorization" ? "API key" : h.name}
                    <Input type={h.secret ? "password" : "text"} autoComplete="off" placeholder={h.description} value={values[h.name] ?? ""} onChange={(e) => setValues({ ...values, [h.name]: e.target.value })} />
                  </label>
                ))}
              {page.auth === "oauth" && <p className="text-sm text-muted-foreground">You sign in after adding it.</p>}
            </section>
          )}
          <section className="grid gap-2">
            <h3 className={heading}>Information</h3>
            <Information info={info} />
          </section>
        </div>
        {page && !page.local && (
          <div className="border-t pt-3">
            <Button onClick={add} disabled={busy}>
              {busy && <LoaderCircleIcon className="animate-spin" />}
              Add {info.title}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// For a server no registry lists: the address, then what is there, its name and how it signs in. A server that takes
// a key gets one field, and one that signs in with OAuth can take a key instead. A key names a header, which the add
// approves.
export function AddressDialog({ onAdded, onClose }: { onAdded: (addon: Addon) => void; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [allowLocal, setAllowLocal] = useState(false);
  const [page, setPage] = useState<AddonPreview | null>(null);
  const [useKey, setUseKey] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keyed = page?.auth === "headers" || useKey;
  const local = allowLocal || error.includes("is a local address");

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    await work().catch((e: Error) => setError(e.message));
    setBusy(false);
  }
  const look = (event: FormEvent) => (
    event.preventDefault(), run(async () => (setPage(null), setPage(await client.addons.preview({ url, allowLocal })), setUseKey(false), setKey("")))
  );
  const add = () =>
    run(async () => {
      if (!keyed) return onAdded(await client.addons.add({ url, allowLocal }, page!.hash));
      const [name, value] = keyHeader(key);
      const ref = { url, allowLocal, headers: [name] };
      const addon = await client.addons.add(ref, (await client.addons.preview(ref)).hash);
      onAdded(await client.addons.setSecrets(addon.id, { headers: { [name]: value } }));
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add by address</DialogTitle>
          <DialogDescription>Paste the server's address. Its docs give it, often ending in /mcp.</DialogDescription>
        </DialogHeader>
        <form onSubmit={look} className="grid gap-3">
          <div className="flex gap-2">
            <Input type="url" required autoFocus aria-label="Address" placeholder="https://mcp.example.com/mcp" value={url} onChange={(e) => (setUrl(e.target.value), setPage(null), setError(""))} />
            <Button type="submit" variant="outline" disabled={busy}>
              {busy && !page ? <LoaderCircleIcon className="animate-spin" /> : "Look"}
            </Button>
          </div>
          {local && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox className="mt-0.5" checked={allowLocal} onCheckedChange={(checked) => (setAllowLocal(checked === true), setPage(null))} />
              <span>
                Allow a local address <span className={hint}>Only for a server you run: it can then reach this machine and your private network.</span>
              </span>
            </label>
          )}
        </form>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {page && (
          <div className="grid gap-3 border-t pt-3">
            <div>
              <p className="font-medium">{page.name}</p>
              <p className="text-sm text-muted-foreground">
                {hostOf(page.url)} · {page.tools ? `${page.tools.length} tools` : keyed ? "Takes a key" : "Signs in with OAuth"}
              </p>
            </div>
            {keyed && (
              <label className={label}>
                API key
                <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
                <span className={`text-xs ${hint}`}>Sent as Authorization: Bearer. For another header, write it as Name: value.</span>
              </label>
            )}
            {page.auth === "oauth" && !useKey && (
              <p className="text-sm text-muted-foreground">
                You sign in after adding it.{" "}
                <button type="button" className="text-foreground underline underline-offset-4" onClick={() => setUseKey(true)}>
                  Use a key instead
                </button>
              </p>
            )}
            <Button onClick={add} disabled={busy || (keyed && !key.trim())} className="justify-self-start">
              Add {page.name}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
