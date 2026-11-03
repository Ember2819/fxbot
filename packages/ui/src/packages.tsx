import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { McpPlugin, Plugin, PackagePlugin, PackagePreview, PackageSearch } from "@fxbot/sdk/client";
import { Details, heading, hint, Initial } from "./mcp-add.tsx";
import { client } from "./client.ts";

// What Browse opens for a package: a card from fxbot's list, or a repository the owner typed.
export type PluginTarget = { ref: string; from: "fxbot" | "github"; name?: string; description?: string };

const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const fromText = { fxbot: "fxbot's list", github: "GitHub" };
const repoLink = (repo: string, path: string, commit: string) => (
  <a href={`https://github.com/${repo}/tree/${commit}${path ? `/${path}` : ""}`} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">
    {repo}
    {path ? `/${path}` : ""}
  </a>
);
// A file's text as plain text: nothing in it renders or runs on the page.
const Text = ({ text }: { text: string }) => <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs break-all whitespace-pre-wrap">{text}</pre>;

// fxbot's packages list, filtered by the page's words.
export function usePackageSearch(query: string) {
  const [result, setResult] = useState<PackageSearch | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    client.plugins.searchPackages(query).then((found) => !stopped && (setResult(found), setError("")), (e: Error) => !stopped && setError(e.message));
    return () => void (stopped = true);
  }, [query]);
  return { result, error };
}

// Any package on GitHub, by its repository and folder: for unvetted plugins.
export function RepoForm({ onOpen }: { onOpen: (target: PluginTarget) => void }) {
  const [repo, setRepo] = useState("");
  const open = (event: FormEvent) => (event.preventDefault(), repo.trim() && onOpen({ ref: repo.trim(), from: "github" }));
  return (
    <form onSubmit={open} className="flex gap-2">
      <Input aria-label="A repository on GitHub" placeholder="owner/repo or owner/repo/folder" value={repo} onChange={(e) => setRepo(e.target.value)} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <Button type="submit" variant="outline" disabled={!repo.trim()}>
        Look
      </Button>
    </form>
  );
}

// A list of paths, each to read when the page has its text.
function Readable({ paths, texts, sizes }: { paths: string[]; texts: Record<string, string>; sizes?: Record<string, number> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid min-w-0 gap-1.5">
      {paths.map((path) => (
        <div key={path} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
              {path}
            </span>
            {sizes?.[path] !== undefined && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{size(sizes[path])}</span>}
            {texts[path] !== undefined && (
              <Button size="xs" variant="ghost" onClick={() => setOpen(open === path ? null : path)}>
                {open === path ? "Hide" : "Read"}
              </Button>
            )}
          </div>
          {open === path && <Text text={texts[path]} />}
        </div>
      ))}
    </div>
  );
}

// What a plugin's page shows, before Add and before an update: what runs inside fxbot, and the rest it carries.
function Contents({ page }: { page: PackagePreview }) {
  const sizes = Object.fromEntries(page.files.map((f) => [f.path, f.size]));
  return (
    <>
      {page.needs.length > 0 && (
        <section className="grid gap-1.5">
          <h3 className={heading}>Needs</h3>
          {page.needs.map((need) => (
            <p key={need.name} className="text-sm">
              <span className="font-mono text-xs">{need.name}</span>
              <span className="text-muted-foreground">{need.added ? ", added" : ", which isn't added yet. Add it first."}</span>
            </p>
          ))}
        </section>
      )}
      {page.code.length > 0 && (
        <section className="grid gap-2">
          <h3 className={heading}>Runs inside fxbot</h3>
          <p className="text-sm">This plugin's code runs inside fxbot, with everything fxbot can reach. Read it before you add it.</p>
          <Readable paths={page.code} texts={page.texts} sizes={sizes} />
        </section>
      )}
      {page.settings.length > 0 && (
        <section className="grid gap-1.5">
          <h3 className={heading}>Settings</h3>
          {page.settings.map((s) => (
            <p key={s.name} className="text-sm">
              <span className="font-mono text-xs">{s.name}</span>
              {s.isSecret ? " (secret)" : ""}
              {s.description ? <span className="text-muted-foreground">: {s.description}</span> : null}
            </p>
          ))}
        </section>
      )}
      {page.migrations.length > 0 && (
        <section className="grid gap-2">
          <h3 className={heading}>Its tables</h3>
          <p className={`text-xs ${hint}`}>Made in a schema of its own, and dropped when you remove it.</p>
          <Readable paths={page.migrations} texts={page.texts} sizes={sizes} />
        </section>
      )}
      {(page.skills.length > 0 || page.servers.length > 0) && (
        <section className="grid gap-1.5">
          <h3 className={heading}>Also carries</h3>
          {page.skills.map((name) => (
            <p key={name} className="text-sm">
              Skill <span className="font-mono text-xs">{name}</span>
            </p>
          ))}
          {page.servers.map((server) => (
            <p key={server.name} className="text-sm">
              MCP server <span className="font-mono text-xs">{server.name}</span>
              <span className="text-muted-foreground">{server.used ? `, added with it: ${server.url}` : ", which runs a command on this machine: not used yet"}</span>
            </p>
          ))}
        </section>
      )}
      <section className="grid gap-2">
        <h3 className={heading}>Files</h3>
        <Readable paths={page.files.map((f) => f.path)} texts={page.texts} sizes={sizes} />
        {page.skipped.length ? <p className="text-xs text-muted-foreground">Passed over: {page.skipped.map((s) => `${s.path} (${s.why})`).join(", ")}</p> : null}
      </section>
    </>
  );
}

// A plugin's page, from its repository's current commit, and the consent to add it. Nothing is saved before Add, and a
// plugin that changed since is shown again.
export function PluginDialog({ target, onAdded, onClose }: { target: PluginTarget; onAdded: (addon: Plugin) => void; onClose: () => void }) {
  const [page, setPage] = useState<PackagePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = { repo: target.ref, from: target.from };
  const look = () => (setPage(null), setError(""), client.plugins.preview(ref).then(setPage, (e: Error) => setError(e.message)));
  useEffect(() => void look(), []);

  async function add() {
    setBusy(true);
    setError("");
    try {
      onAdded(await client.plugins.add(ref, page!.hash));
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes("changed since")) await look();
    }
    setBusy(false);
  }

  const name = page?.name || target.name || target.ref;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2 pr-6">
            <Initial title={name} />
            <DialogTitle className="truncate">{name}</DialogTitle>
          </div>
          {(page?.description || target.description) && <DialogDescription>{page?.description || target.description}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto px-4">
          {!page && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> Reading {target.ref}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {page?.error && <p className="text-sm text-destructive">{page.error}</p>}
          {page && !page.error && <Contents page={page} />}
          {page && (
            <section className="grid gap-2">
              <h3 className={heading}>Information</h3>
              <Details
                rows={[
                  ["Repository", <span key="repo">{repoLink(page.source.repo, page.source.path, page.source.commit)}, at {page.source.commit.slice(0, 7)}</span>],
                  ["Version", page.version || undefined],
                  ["Source", fromText[target.from]],
                ]}
              />
            </section>
          )}
        </div>
        {page?.hash && (
          <div className="border-t pt-3">
            <Button onClick={add} disabled={busy || page.needs.some((need) => !need.added)}>
              {busy && <LoaderCircleIcon className="animate-spin" />}
              Add {page.name}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// An installed plugin: which bots it reaches, its settings, what it added to fxbot, its log, and its source, with
// Update when its files changed there, which shows what changed and needs the owner's Update before anything moves.
export function PluginSettings({
  addon,
  bots,
  servers,
  onOpenServer,
  onChange,
  onRemoved,
  onClose,
}: {
  addon: PackagePlugin;
  bots: ReactNode;
  servers: McpPlugin[];
  onOpenServer: (id: string) => void;
  onChange: (addon: Plugin) => void;
  onRemoved: () => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[] | null>(null);
  const [next, setNext] = useState<PackagePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { source } = addon;
  const fromGitHub = "repo" in source;
  const look = () => {
    if (!("repo" in source)) return;
    setBusy(true);
    setError("");
    client.plugins
      .preview({ repo: `${source.repo}${source.path ? `/${source.path}` : ""}`, from: source.from })
      .then(setNext, (e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };
  const update = () => (setBusy(true), client.plugins.update(addon.id, next!.hash).then((moved) => (setNext(null), onChange(moved)), (e: Error) => setError(e.message)).finally(() => setBusy(false)));
  const save = (event: FormEvent) => (
    event.preventDefault(), setError(""), client.plugins.configure(addon.id, values).then((saved) => (setValues({}), onChange(saved)), (e: Error) => setError(e.message))
  );
  async function remove() {
    if (!confirm(`Remove ${addon.name}? Its tables and settings go with it.`)) return;
    await client.plugins.remove(addon.id).then(onRemoved, (e: Error) => setError(e.message));
  }
  const parts = [
    ...addon.parts.tools.map((t) => `Tool ${t}`),
    ...addon.parts.hooks.map((h) => `Hook ${h}`),
    ...addon.parts.routes.map((r) => `Route ${r}`),
    ...(addon.parts.sockets ?? []).map((s) => `Socket ${s}`),
    ...(addon.parts.page ? ["Parts of the page"] : []),
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{addon.name}</DialogTitle>
          <DialogDescription>{addon.description}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 grid-cols-1 content-start gap-5 overflow-y-auto px-4">
          {addon.error && <p className="text-sm text-destructive">Off: {addon.error}</p>}
          {bots}
          {addon.settings.length > 0 && (
            <form onSubmit={save} className="grid gap-3">
              <h3 className={heading}>Settings</h3>
              {addon.settings.map((s) => (
                <label key={s.name} className="grid gap-1.5 text-sm font-medium">
                  <span>
                    {s.name}
                    {s.description && <span className="font-normal text-muted-foreground">: {s.description}</span>}
                  </span>
                  <Input
                    type={s.isSecret ? "password" : "text"}
                    autoComplete="off"
                    value={values[s.name] ?? (s.isSecret ? "" : (s.value ?? ""))}
                    placeholder={s.isSecret ? (s.set ? "Set. Type to replace it." : "Not set") : (s.default ?? "")}
                    onChange={(e) => setValues({ ...values, [s.name]: e.target.value })}
                  />
                </label>
              ))}
              <Button type="submit" size="sm" className="justify-self-start" disabled={!Object.keys(values).length}>
                Save settings
              </Button>
            </form>
          )}
          <section className="grid gap-1.5">
            <h3 className={heading}>What it adds</h3>
            {parts.length ? (
              <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
                {parts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing while it's off.</p>
            )}
          </section>
          {servers.length > 0 && (
            <section className="grid gap-2">
              <h3 className={heading}>Its MCP servers</h3>
              <p className={`text-xs ${hint}`}>They follow this plugin's switch and bots, and go when it does.</p>
              {servers.map((server) => (
                <div key={server.id} className="flex min-w-0 items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {server.name} <span className="text-muted-foreground">· {server.status || "Off"}</span>
                  </span>
                  <Button size="xs" variant="outline" onClick={() => onOpenServer(server.id)}>
                    Settings
                  </Button>
                </div>
              ))}
            </section>
          )}
          <section className="grid gap-2">
            <h3 className={heading}>Log</h3>
            {log === null ? (
              <Button size="sm" variant="outline" className="justify-self-start" onClick={() => client.plugins.log(addon.id).then(setLog, (e: Error) => setError(e.message))}>
                Show the log
              </Button>
            ) : (
              <Text text={log.length ? log.join("\n") : "Nothing yet."} />
            )}
          </section>
          <section className="grid gap-2">
            <h3 className={heading}>Source</h3>
            {addon.mark?.kind === "removed" && <p className="text-sm text-destructive">Its repository no longer has it. It still works as added.</p>}
            <Details
              rows={
                "repo" in source
                  ? [
                      ["Repository", <span key="repo">{repoLink(source.repo, source.path, source.commit)}, at {source.commit.slice(0, 7)}</span>],
                      ["Version", addon.version],
                      ["Source", fromText[source.from]],
                      ["Needs", addon.needs.join(", ") || undefined],
                    ]
                  : [
                      ["Folder", <span key="folder" className="font-mono text-xs break-all">{source.local}</span>],
                      ["Version", addon.version],
                      ["Needs", addon.needs.join(", ") || undefined],
                    ]
              }
            />
            {!fromGitHub && <p className={`text-xs ${hint}`}>A local plugin, from FXBOT_PLUGIN_DIRS. fxbot reads it again when it starts.</p>}
            {addon.mark?.kind === "update" && !next && (
              <Button size="sm" variant="outline" className="justify-self-start" disabled={busy} onClick={look}>
                {busy && <LoaderCircleIcon className="animate-spin" />}
                Update to {addon.mark.version}
              </Button>
            )}
            {next && (
              <div className="grid gap-3 rounded-lg border p-3 text-sm">
                {next.error ? (
                  <p className="text-destructive">{next.error}</p>
                ) : (
                  <>
                    <p className="font-medium">What changes</p>
                    <ul className="grid gap-1 font-mono text-xs text-muted-foreground">
                      {(next.changed?.length ? next.changed.map((c) => `${c.change[0].toUpperCase()}${c.change.slice(1)} ${c.path}`) : ["Nothing in its files"]).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <Contents page={next} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={update} disabled={busy}>
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
