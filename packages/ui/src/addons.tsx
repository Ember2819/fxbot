import { useEffect, useState, type FormEvent } from "react";
import { ExternalLinkIcon, LoaderCircleIcon, PencilIcon, PlusIcon, PuzzleIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Addon, AddonPreview, OAuthAttempt, OAuthStatus, Profile } from "@fxbot/sdk/client";
import { Blob } from "./blob.tsx";
import { client } from "./client.ts";

const label = "grid gap-1.5 text-sm font-medium";
const hint = "font-normal text-muted-foreground";
const heading = "text-sm font-medium";
const hostOf = (url: string) => new URL(url).host;
// A key without a scheme is a bearer token. "Bearer …" and "Token …" go as written.
const bearer = (key: string) => (/\s/.test(key.trim()) ? key.trim() : `Bearer ${key.trim()}`);
// A key goes in Authorization, unless it is written as a header of its own, such as "X-Api-Key: …".
function keyHeader(key: string): [string, string] {
  const named = /^([A-Za-z][A-Za-z0-9-]*):\s+(\S.*)$/.exec(key.trim());
  return named ? [named[1], named[2]] : ["Authorization", bearer(key)];
}

// Under a server's name: how it is, how many of its tools bots get, and which bots.
function summary(addon: Addon, profiles: Profile[] | null) {
  if (!addon.enabled) return "Off";
  const allowed = addon.tools.filter((t) => addon.allowed.includes(t.name)).length;
  const chosen = profiles?.filter((p) => addon.on.includes(p.id)).length ?? addon.on.length;
  return [
    addon.status,
    addon.tools.length ? `${allowed} of ${addon.tools.length} tools` : "",
    addon.bots === "all" ? "All bots" : `${chosen} bot${chosen === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Remote MCP servers, one row each with a switch, and an edit button that opens the server's settings.
export function AddonsPage({ profiles }: { profiles: Profile[] | null }) {
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<Addon | null>(null);
  const load = () => client.addons.list().then((list) => (setAddons(list), setError("")), (e: Error) => setError(e.message));
  useEffect(() => void load(), []);
  // A server's status changes by itself while it connects.
  useEffect(() => {
    if (!addons?.some((a) => a.status === "Connecting")) return;
    const again = setTimeout(load, 1500);
    return () => clearTimeout(again);
  }, [addons]);
  const replace = (next: Addon) => setAddons((all) => all?.map((a) => (a.id === next.id ? next : a)) ?? null);
  const open = addons?.find((a) => a.id === openId);
  const signIn = (addon: Addon) => (setOpenId(null), setSigningIn(addon));

  return (
    <>
      <header className="box-content flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
        <SidebarTrigger />
        <h1 className="flex-1 font-medium">Add-ons</h1>
        {Boolean(addons?.length) && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Add
          </Button>
        )}
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-6">
        {error && <p role="alert" className="mx-auto w-full max-w-xl text-sm text-destructive">{error}</p>}
        {addons?.length === 0 && (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PuzzleIcon />
              </EmptyMedia>
              <EmptyTitle>No MCP servers yet</EmptyTitle>
              <EmptyDescription>Add one by its address, and your bots get its tools.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setAdding(true)}>Add a server</Button>
            </EmptyContent>
          </Empty>
        )}
        {Boolean(addons?.length) && (
          <ul className="mx-auto w-full max-w-xl divide-y rounded-xl border">
            {addons!.map((addon) => (
              <li key={addon.id} className="flex items-center gap-2 py-2.5 pr-3 pl-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{addon.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{summary(addon, profiles)}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${addon.name}`} onClick={() => setOpenId(addon.id)}>
                  <PencilIcon />
                </Button>
                <Switch aria-label={`Use ${addon.name}`} checked={addon.enabled} onCheckedChange={(enabled) => client.addons.change(addon.id, { enabled }).then(replace, (e: Error) => setError(e.message))} />
              </li>
            ))}
          </ul>
        )}
      </main>
      {adding && <AddServer onClose={() => setAdding(false)} onAdded={(addon) => (setAdding(false), setAddons((all) => [...(all ?? []), addon]), addon.auth === "oauth" && signIn(addon))} />}
      {open && (
        <AddonSettings
          addon={open}
          profiles={profiles}
          onChange={replace}
          onSignIn={() => signIn(open)}
          onRemoved={() => (setOpenId(null), setAddons((all) => all?.filter((a) => a.id !== open.id) ?? null))}
          onClose={() => setOpenId(null)}
        />
      )}
      {signingIn && <SignIn addon={signingIn} onClose={() => (setSigningIn(null), void load())} />}
    </>
  );
}

// The address, then what is there: the server's name and how it signs in. A server that takes a key gets one field,
// and one that signs in with OAuth can take a key instead. A key names a header, which the add approves.
function AddServer({ onAdded, onClose }: { onAdded: (addon: Addon) => void; onClose: () => void }) {
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an MCP server</DialogTitle>
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

// One server: its sign-in or key, which bots have it, and which of its tools they get. Changes save as they are made.
function AddonSettings({ addon, profiles, onChange, onSignIn, onRemoved, onClose }: { addon: Addon; profiles: Profile[] | null; onChange: (addon: Addon) => void; onSignIn: () => void; onRemoved: () => void; onClose: () => void }) {
  const [keys, setKeys] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const saved = (work: Promise<Addon>) => (setError(""), work.then(onChange, (e: Error) => setError(e.message)));
  const change = (fields: Pick<Partial<Addon>, "bots" | "allowed">) => (onChange({ ...addon, ...fields }), saved(client.addons.change(addon.id, fields)));
  const forBot = (id: string, on: boolean) => (onChange({ ...addon, on: on ? [...addon.on, id] : addon.on.filter((b) => b !== id) }), saved(client.addons.forBot(id, addon.id, on)));
  const allow = (name: string, on: boolean) => change({ allowed: on ? [...addon.allowed, name] : addon.allowed.filter((n) => n !== name) });
  const allowed = addon.tools.filter((t) => addon.allowed.includes(t.name)).length;
  const saveKeys = (event: FormEvent) => (
    event.preventDefault(),
    saved(client.addons.setSecrets(addon.id, { headers: Object.fromEntries(Object.entries(keys!).filter(([, v]) => v.trim()).map(([n, v]) => [n, n === "Authorization" ? bearer(v) : v.trim()])) })).then(() => setKeys(null))
  );
  async function remove() {
    if (!confirm(`Remove ${addon.name}? Its tools leave every bot.`)) return;
    await client.addons.remove(addon.id).then(onRemoved, (e: Error) => setError(e.message));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{addon.name}</DialogTitle>
          <DialogDescription>
            {hostOf(addon.url)} · {addon.status}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4">
          {addon.auth !== "none" && keys === null && (
            <div className="flex items-center justify-between gap-3">
              <p className={heading}>
                {addon.auth === "oauth" ? "Sign-in" : "Key"} <span className={hint}>{addon.signedIn ? (addon.auth === "oauth" ? "Signed in" : "Saved") : "Not set"}</span>
              </p>
              <Button size="sm" variant={addon.signedIn ? "outline" : "default"} onClick={addon.auth === "oauth" ? onSignIn : () => setKeys(Object.fromEntries(addon.headers.map((h) => [h, ""])))}>
                {addon.auth === "oauth" ? (addon.signedIn ? "Sign in again" : "Sign in") : addon.signedIn ? "Replace" : "Add key"}
              </Button>
            </div>
          )}
          {keys && (
            <form onSubmit={saveKeys} className="grid gap-2">
              {Object.keys(keys).map((name, i) => (
                <Input key={name} type="password" autoComplete="off" autoFocus={i === 0} aria-label={name} placeholder={name === "Authorization" ? "API key" : name} value={keys[name]} onChange={(e) => setKeys({ ...keys, [name]: e.target.value })} />
              ))}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!Object.values(keys).some((v) => v.trim())}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setKeys(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className={heading}>Bots</h3>
              <Tabs value={addon.bots} onValueChange={(bots) => change({ bots: bots as Addon["bots"] })}>
                <TabsList>
                  <TabsTrigger value="all">All bots</TabsTrigger>
                  <TabsTrigger value="each">Choose</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {addon.bots === "each" &&
              profiles?.map((p) => (
                <label key={p.id} className="flex items-center gap-3 text-sm">
                  <Blob shape={p.shape} color={p.color} size={24} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <Switch checked={addon.on.includes(p.id)} onCheckedChange={(on) => forBot(p.id, on)} />
                </label>
              ))}
          </section>

          <section className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className={heading}>
                Tools {addon.tools.length > 0 && <span className={hint}>{allowed} of {addon.tools.length} allowed</span>}
              </h3>
              {addon.tools.length > 0 && (
                <div className="flex">
                  <Button size="xs" variant="ghost" onClick={() => change({ allowed: addon.tools.map((t) => t.name) })}>
                    All
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => change({ allowed: [] })}>
                    None
                  </Button>
                </div>
              )}
            </div>
            {addon.tools.length === 0 && <p className="text-sm text-muted-foreground">{addon.signedIn || addon.auth === "none" ? "It lists no tools yet." : "Its tools show once it is signed in."}</p>}
            <ul className="grid">
              {addon.tools.map((tool) => (
                <li key={tool.name}>
                  <label className="flex items-start gap-3 rounded-md py-1.5 text-sm">
                    <Checkbox className="mt-0.5" checked={addon.allowed.includes(tool.name)} onCheckedChange={(on) => allow(tool.name, on === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[0.8rem]">{tool.name}</span>
                      {tool.readOnly && <span className="text-muted-foreground"> · read-only</span>}
                      {tool.description && <span className="line-clamp-1 block text-muted-foreground">{tool.description}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="ghost" size="sm" className="justify-self-start self-start text-destructive" onClick={remove}>
          Remove
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// Opens the server's sign-in page in a tab, then waits. A loopback redirect cannot load on a phone, so the person
// pastes the address of the page that failed instead. When signing in cannot start, the person's own OAuth app can
// stand in for one fxbot registers.
function SignIn({ addon, onClose }: { addon: Addon; onClose: () => void }) {
  const [attempt, setAttempt] = useState<OAuthAttempt | null>(null);
  const [status, setStatus] = useState<OAuthStatus>({ status: "waiting" });
  const [address, setAddress] = useState("");
  const [cannotStart, setCannotStart] = useState(false);
  const [own, setOwn] = useState({ clientId: "", clientSecret: "" });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    client.addons.signIn(addon.id).then(setAttempt, (e: Error) => (setCannotStart(true), setStatus({ status: "failed", error: e.message })));
  }, [addon.id, tries]);
  useEffect(() => {
    if (!attempt || status.status !== "waiting") return;
    const timer = setInterval(() => client.oauth.get(attempt.id).then((next) => next.status !== "waiting" && setStatus(next), () => {}), 1500);
    return () => clearInterval(timer);
  }, [attempt, status.status]);
  const paste = (event: FormEvent) => (event.preventDefault(), client.oauth.paste(attempt!.id, address).then(setStatus, (e: Error) => setStatus({ status: "waiting", error: e.message })));
  const withOwn = (event: FormEvent) => (
    event.preventDefault(),
    client.addons.setSecrets(addon.id, own).then(
      () => (setCannotStart(false), setStatus({ status: "waiting" }), setTries((n) => n + 1)),
      (e: Error) => setStatus({ status: "failed", error: e.message }),
    )
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Sign in to {addon.name}</DialogTitle>
        <DialogDescription>
          {attempt?.mode === "paste"
            ? "Approve fxbot on the page that opens. Unless this is the computer fxbot runs on, the page it sends you to will not load: copy that page's address, and paste it here."
            : "Approve fxbot on the page that opens. It comes back here by itself."}
        </DialogDescription>
        {!attempt && status.status === "waiting" && <LoaderCircleIcon className="animate-spin text-muted-foreground" />}
        {attempt && status.status === "waiting" && (
          <div className="grid gap-3">
            <a href={attempt.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: "justify-self-start" })}>
              Open the sign-in page <ExternalLinkIcon />
            </a>
            {attempt.mode === "paste" && (
              <form onSubmit={paste} className="grid gap-2">
                <label className={label}>
                  Address of the page that did not load
                  <Input value={address} placeholder="http://127.0.0.1:8787/callback?code=…" onChange={(e) => setAddress(e.target.value)} />
                </label>
                <Button type="submit" variant="outline" className="justify-self-start" disabled={!address.trim()}>
                  Finish signing in
                </Button>
              </form>
            )}
          </div>
        )}
        {status.status === "done" && <p className="text-sm">Connected. {addon.name}'s tools are ready for your bots.</p>}
        {status.error && (
          <p role="alert" className="text-sm text-destructive">
            {status.error}
          </p>
        )}
        {cannotStart && (
          <form onSubmit={withOwn} className="grid gap-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">Or sign in with your own OAuth app, registered with {addon.name}.</p>
            <Input aria-label="Client id" placeholder="Client id" value={own.clientId} onChange={(e) => setOwn({ ...own, clientId: e.target.value })} />
            <Input aria-label="Client secret" type="password" autoComplete="off" placeholder="Client secret, if it has one" value={own.clientSecret} onChange={(e) => setOwn({ ...own, clientSecret: e.target.value })} />
            <Button type="submit" variant="outline" className="justify-self-start" disabled={!own.clientId.trim()}>
              Sign in with it
            </Button>
          </form>
        )}
        {status.status !== "waiting" && (
          <Button className="justify-self-start" onClick={onClose}>
            Done
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// A bot's settings list the servers that are on: those for every bot, and a switch for each one chosen bot by bot.
export function BotAddons({ profileId }: { profileId: string }) {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [error, setError] = useState("");
  useEffect(() => void client.addons.list().then((all) => setAddons(all.filter((a) => a.enabled)), () => {}), []);
  if (!addons.length) return null;
  const set = (addon: Addon, on: boolean) =>
    client.addons.forBot(profileId, addon.id, on).then((next) => setAddons((all) => all.map((a) => (a.id === next.id ? next : a))), (e: Error) => setError(e.message));
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium">Add-ons</legend>
      {addons.map((addon) => (
        <label key={addon.id} className="flex items-center justify-between gap-3 text-sm">
          {addon.name}
          {addon.bots === "all" ? <span className="text-muted-foreground">All bots</span> : <Switch checked={addon.on.includes(profileId)} onCheckedChange={(on) => set(addon, on)} />}
        </label>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
