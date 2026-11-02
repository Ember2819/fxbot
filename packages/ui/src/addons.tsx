import { useEffect, useState, type FormEvent } from "react";
import { ExternalLinkIcon, LoaderCircleIcon, PencilIcon, PuzzleIcon, SearchIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Addon, AddonCard, AddonMark, AddonPreview, McpAddon, OAuthAttempt, OAuthStatus, Profile, SkillCard } from "@fxbot/sdk/client";
import { AddressDialog, bearer, EntryDialog, heading, hint, hostOf, Information, label, Results, signsIn, useSearch } from "./addon-add.tsx";
import { Blob } from "./blob.tsx";
import { client } from "./client.ts";
import { SkillDialog, SkillResults, SkillSettings, useSkillSearch } from "./skills.tsx";

// Past this many, the page says how many tools reach the bots: each one's schema rides along with every message.
const toolBudget = 40;

// Under an add-on's name: what it is, or how a server is and how many of its tools bots get, and which bots.
function summary(addon: Addon, profiles: Profile[] | null) {
  if (!addon.enabled) return "Off";
  const chosen = profiles?.filter((p) => addon.on.includes(p.id)).length ?? addon.on.length;
  const bots = addon.bots === "all" ? "All bots" : `${chosen} bot${chosen === 1 ? "" : "s"}`;
  if (addon.kind === "skill") return `Skill · ${bots}`;
  const allowed = addon.tools.filter((t) => addon.allowed.includes(t.name)).length;
  return [addon.status, addon.tools.length ? `${allowed} of ${addon.tools.length} tools` : "", bots].filter(Boolean).join(" · ");
}
const markText: Record<Addon["kind"], Record<AddonMark["kind"], string>> = {
  mcp: { update: "Update available", deprecated: "Deprecated", removed: "Removed from the registry" },
  skill: { update: "Update available", deprecated: "Deprecated", removed: "Removed from its repository" },
};

type Tab = "installed" | "skills" | "mcp" | "plugins";

// One search over every kind of add-on, with a tab for what is installed and one per kind. Installed lists servers
// and skills, one row each with a switch and an edit button that opens its settings. The Skills tab searches fxbot's
// skills list and skills.sh, and the MCP tab the MCP registries; plugins aren't built yet.
export function AddonsPage({ profiles }: { profiles: Profile[] | null }) {
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [everything, setEverything] = useState(false);
  const [chosen, setChosen] = useState<Tab | null>(null);
  const [entry, setEntry] = useState<AddonCard | null>(null);
  const [skill, setSkill] = useState<SkillCard | null>(null);
  const [byAddress, setByAddress] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<McpAddon | null>(null);
  const search = useSearch(query, everything);
  const skillSearch = useSkillSearch(query);
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
  const servers = (addons ?? []).flatMap((a) => (a.kind === "mcp" ? [a] : []));
  const reaching = servers.filter((a) => a.enabled).reduce((n, a) => n + a.tools.filter((t) => a.allowed.includes(t.name)).length, 0);
  const signIn = (addon: McpAddon) => (setOpenId(null), setSigningIn(addon));
  // Installed first when there is anything installed, else the registry.
  const tab = chosen ?? (addons?.length ? "installed" : "mcp");
  const words = query.trim().toLowerCase();
  const mine = (addons ?? []).filter(
    (a) => !words || (a.kind === "mcp" ? [a.name, a.source?.registry ?? "", hostOf(a.url)] : [a.name, a.source.skill, a.description]).some((text) => text.toLowerCase().includes(words)),
  );
  const found = words && search.result ? search.result.cards.length : undefined;
  const skillsFound = words && skillSearch.result ? skillSearch.result.cards.length : undefined;
  // The mirror gives 20 at most.
  const count = (n: number) => <span className="text-muted-foreground tabular-nums">{n >= 20 ? "20+" : n}</span>;
  const added = new Set(servers.flatMap((a) => [a.url, ...(a.source ? [a.source.registry] : [])]));
  const skillsAdded = new Set((addons ?? []).flatMap((a) => (a.kind === "skill" ? [a.source.skill] : [])));
  const onAdded = (addon: Addon) => {
    setEntry(null);
    setSkill(null);
    setByAddress(false);
    setAddons((all) => [...(all ?? []), addon]);
    setQuery("");
    setChosen("installed");
    if (addon.kind === "mcp" && addon.auth === "oauth") signIn(addon);
  };

  return (
    <>
      <header className="box-content flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
        <SidebarTrigger />
        <h1 className="flex-1 font-medium">Add-ons</h1>
      </header>
      <main className="flex flex-1 flex-col overflow-y-auto px-4 pb-6">
        <div className="mx-auto grid w-full max-w-xl gap-3">
          <div className="relative">
            <SearchIcon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input enterKeyHint="search" aria-label="Search add-ons" placeholder="Search add-ons" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
            {(tab === "skills" ? skillSearch.busy : search.busy) && words && <LoaderCircleIcon className="absolute top-2.5 right-3 size-4 animate-spin text-muted-foreground" />}
          </div>
          <Tabs value={tab} onValueChange={(next) => setChosen(next as Tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="installed">Installed{words && addons?.length ? count(mine.length) : null}</TabsTrigger>
              <TabsTrigger value="skills">Skills{skillsFound !== undefined ? count(skillsFound) : null}</TabsTrigger>
              <TabsTrigger value="mcp">MCP{found !== undefined ? count(found) : null}</TabsTrigger>
              <TabsTrigger value="plugins">Plugins</TabsTrigger>
            </TabsList>
          </Tabs>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {tab === "installed" && addons?.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PuzzleIcon />
                </EmptyMedia>
                <EmptyTitle>Nothing added yet</EmptyTitle>
                <EmptyDescription>Find a skill or an MCP server above, and your bots get its instructions or its tools.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                <Button onClick={() => setChosen("skills")}>Browse skills</Button>
                <Button variant="outline" onClick={() => setChosen("mcp")}>
                  Browse MCP servers
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {tab === "installed" && Boolean(addons?.length) && mine.length === 0 && (
            <p className="text-sm text-muted-foreground">
              None of yours match.{" "}
              {skillsFound ? (
                <button type="button" className="text-foreground underline underline-offset-4" onClick={() => setChosen("skills")}>
                  {skillsFound >= 20 ? "20+" : skillsFound} in Skills
                </button>
              ) : null}
              {skillsFound && found ? " · " : null}
              {found ? (
                <button type="button" className="text-foreground underline underline-offset-4" onClick={() => setChosen("mcp")}>
                  {found >= 20 ? "20+" : found} in MCP
                </button>
              ) : null}
            </p>
          )}
          {tab === "installed" && mine.length > 0 && (
            <ul className="divide-y rounded-xl border">
              {mine.map((addon) => (
                <li key={addon.id} className="flex items-center gap-2 py-2.5 pr-3 pl-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-medium">{addon.name}</span>
                      {addon.mark && <span className={`shrink-0 text-xs ${addon.mark.kind === "update" ? "text-muted-foreground" : "text-destructive"}`}>{markText[addon.kind][addon.mark.kind]}</span>}
                    </p>
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
          {tab === "installed" && reaching > toolBudget && (
            <p className="text-sm text-muted-foreground">
              {reaching} tools reach your bots. Past {toolBudget}, every message carries more, since each tool's description goes with it. Allow fewer in each server's settings.
            </p>
          )}
          {tab === "mcp" && <Results search={search} everything={everything} onEverything={setEverything} added={added} onOpen={setEntry} onAddress={() => setByAddress(true)} />}
          {tab === "skills" && <SkillResults search={skillSearch} words={words} added={skillsAdded} onOpen={setSkill} />}
          {tab === "plugins" && <p className="py-6 text-center text-sm text-muted-foreground">Plugins aren't in fxbot yet. For now, add-ons are skills and MCP servers.</p>}
        </div>
      </main>
      {entry && <EntryDialog card={entry} onAdded={onAdded} onClose={() => setEntry(null)} />}
      {skill && <SkillDialog card={skill} onAdded={onAdded} onClose={() => setSkill(null)} />}
      {byAddress && <AddressDialog onAdded={onAdded} onClose={() => setByAddress(false)} />}
      {open?.kind === "mcp" && (
        <AddonSettings
          addon={open}
          profiles={profiles}
          onChange={replace}
          onSignIn={() => signIn(open)}
          onRemoved={() => (setOpenId(null), setAddons((all) => all?.filter((a) => a.id !== open.id) ?? null))}
          onClose={() => setOpenId(null)}
        />
      )}
      {open?.kind === "skill" && (
        <SkillSettings
          addon={open}
          bots={<BotsChoice addon={open} profiles={profiles} onChange={replace} />}
          onChange={replace}
          onRemoved={() => (setOpenId(null), setAddons((all) => all?.filter((a) => a.id !== open.id) ?? null))}
          onClose={() => setOpenId(null)}
        />
      )}
      {signingIn && <SignIn addon={signingIn} onClose={() => (setSigningIn(null), void load())} />}
    </>
  );
}

// One server: its sign-in or key, which bots have it, and which of its tools they get. Changes save as they are made.
function AddonSettings({ addon, profiles, onChange, onSignIn, onRemoved, onClose }: { addon: McpAddon; profiles: Profile[] | null; onChange: (addon: Addon) => void; onSignIn: () => void; onRemoved: () => void; onClose: () => void }) {
  const [keys, setKeys] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const saved = (work: Promise<Addon>) => (setError(""), work.then(onChange, (e: Error) => setError(e.message)));
  const change = (fields: Pick<Partial<McpAddon>, "bots" | "allowed">) => (onChange({ ...addon, ...fields }), saved(client.addons.change(addon.id, fields)));
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

          {addon.source && <FromRegistry addon={addon} onChange={onChange} />}

          <BotsChoice addon={addon} profiles={profiles} onChange={onChange} />

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

// Which bots have an add-on: all of them, or those chosen here, each with a switch. Changes save as they are made.
function BotsChoice({ addon, profiles, onChange }: { addon: Addon; profiles: Profile[] | null; onChange: (addon: Addon) => void }) {
  const [error, setError] = useState("");
  const saved = (work: Promise<Addon>) => (setError(""), work.then(onChange, (e: Error) => setError(e.message)));
  const forBot = (id: string, on: boolean) => (onChange({ ...addon, on: on ? [...addon.on, id] : addon.on.filter((b) => b !== id) }), saved(client.addons.forBot(id, addon.id, on)));
  const choose = (bots: Addon["bots"]) => (onChange({ ...addon, bots }), saved(client.addons.change(addon.id, { bots })));
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={heading}>Bots</h3>
        <Tabs value={addon.bots} onValueChange={(bots) => choose(bots as Addon["bots"])}>
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
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

// An add-on from a registry: what the registry says about it now, and when there is a newer version, the newer page
// with what changed, which needs the owner's Update before anything moves.
function FromRegistry({ addon, onChange }: { addon: McpAddon; onChange: (addon: Addon) => void }) {
  const [next, setNext] = useState<AddonPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const source = addon.source!;
  const look = () => (
    setLooking(true),
    setError(""),
    client.addons.preview({ registry: source.registry, allowLocal: addon.allowLocal, from: source.from }).then(setNext, (e: Error) => setError(e.message)).finally(() => setLooking(false))
  );
  const update = () => client.addons.update(addon.id, next!.hash).then((moved) => (setNext(null), onChange(moved)), (e: Error) => setError(e.message));
  const changes = next
    ? [
        next.info && next.info.version !== source.version && `Version ${source.version} → ${next.info.version}`,
        next.url !== addon.url && `Address ${hostOf(addon.url)} → ${hostOf(next.url)}`,
        next.auth !== addon.auth && `Sign-in: ${signsIn[addon.auth]} → ${signsIn[next.auth]}`,
        next.headers.map((h) => h.name).join() !== addon.headers.join() && `Headers: ${addon.headers.join(", ") || "none"} → ${next.headers.map((h) => h.name).join(", ") || "none"}`,
      ].filter(Boolean)
    : [];
  return (
    <section className="grid gap-2">
      <h3 className={heading}>From the registry</h3>
      {addon.mark?.kind === "deprecated" && <p className="text-sm text-destructive">The registry marks it deprecated. It still works, but may stop.</p>}
      {addon.mark?.kind === "removed" && <p className="text-sm text-destructive">The registry no longer lists it. It still works as added.</p>}
      {addon.info ? <Information info={{ ...addon.info, version: source.version }} /> : <p className="text-sm text-muted-foreground">Added as {source.registry} {source.version}.</p>}
      {addon.mark?.kind === "update" && !next && (
        <Button size="sm" variant="outline" className="justify-self-start" disabled={looking} onClick={look}>
          {looking && <LoaderCircleIcon className="animate-spin" />}
          Update to {addon.mark.version}
        </Button>
      )}
      {next && (
        <div className="grid gap-2 rounded-lg border p-3 text-sm">
          {next.local ? (
            <p>Its newer version runs only on this machine, which comes with plugins.</p>
          ) : (
            <>
              <p className="font-medium">What changes</p>
              {changes.length ? (
                <ul className="grid gap-1 text-muted-foreground">
                  {changes.map((change) => (
                    <li key={String(change)}>{change}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Only its version.</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={update}>
                  Update
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNext(null)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

// Opens the server's sign-in page in a tab, then waits. A loopback redirect cannot load on a phone, so the person
// pastes the address of the page that failed instead. When signing in cannot start, the person's own OAuth app can
// stand in for one fxbot registers.
function SignIn({ addon, onClose }: { addon: McpAddon; onClose: () => void }) {
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
