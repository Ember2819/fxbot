import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Plugin, SkillPlugin, SkillCard, SkillFile, SkillPreview, SkillSearch } from "@fxbot/sdk/client";
import { Details, heading, hint } from "./mcp-add.tsx";
import { PluginIcon } from "./plugin-icon.tsx";
import { client } from "./client.ts";

const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
const size = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const fromText = { fxbot: "fxbot's list", "skills.sh": "skills.sh" };
// A repository's page at the commit a skill came from.
const repoLink = (skill: string, commit: string) => {
  const repo = skill.split("/").slice(0, 2).join("/");
  return (
    <a href={`https://github.com/${repo}/tree/${commit}`} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">
      {repo}
    </a>
  );
};

// fxbot's skills list, and skills.sh's search for the page's words, once typing stops.
export function useSkillSearch(query: string) {
  const [result, setResult] = useState<SkillSearch | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let stopped = false;
    setBusy(true);
    const wait = setTimeout(
      () =>
        client.plugins
          .searchSkills(query)
          .then((found) => !stopped && (setResult(found), setError("")), (e: Error) => !stopped && setError(e.message))
          .finally(() => !stopped && setBusy(false)),
      query ? 250 : 0,
    );
    return () => ((stopped = true), clearTimeout(wait));
  }, [query]);
  return { result, error, busy };
}

// Unvetted skills on Browse: skills.sh's results. `added` holds the ids of installed skills.
export function SkillResults({ search, words, added, onOpen }: { search: ReturnType<typeof useSkillSearch>; words: string; added: Set<string>; onOpen: (card: SkillCard) => void }) {
  const { result, error } = search;
  return (
    <div className="grid gap-2">
      {!words && <p className="text-sm text-muted-foreground">Type above to search skills.sh.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result?.error && <p className="text-sm text-destructive">{result.error}</p>}
      {result?.cards.map((card) => (
        <button
          key={card.id}
          type="button"
          onClick={() => onOpen(card)}
          className="flex w-full min-w-0 gap-3 rounded-lg border p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PluginIcon iconKey={card.iconKey} />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="max-w-[70%] shrink-0 truncate font-medium">{card.name}</span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{card.repository}</span>
              {card.installs !== undefined && <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{compact(card.installs)} installs</span>}
            </span>
            {card.description && <span className="line-clamp-2 text-sm text-muted-foreground">{card.description}</span>}
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <Badge variant={card.from === "fxbot" ? "default" : "outline"}>{card.from}</Badge>
              {added.has(card.id) && <span className="text-foreground">Added</span>}
            </span>
          </span>
        </button>
      ))}
      {result && words.length >= 2 && result.cards.length === 0 && !result.error && <p className="text-sm text-muted-foreground">No skill on skills.sh matches.</p>}
    </div>
  );
}

// A file's text, shown as plain text: skill text is someone else's instructions, and nothing in it renders.
const Text = ({ text }: { text: string }) => <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs break-all whitespace-pre-wrap">{text}</pre>;

// A skill's files: SKILL.md, then the rest, each to read, and those passed over and why.
function Files({ files, skipped, read }: { files: SkillFile[]; skipped?: { path: string; why: string }[]; read: (path: string) => Promise<string> }) {
  const [open, setOpen] = useState<{ path: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);
  const shown = all ? files : files.slice(0, 5);
  const toggle = (path: string) => (open?.path === path ? setOpen(null) : read(path).then((text) => (setOpen({ path, text }), setError("")), (e: Error) => setError(e.message)));
  return (
    <div className="grid min-w-0 gap-1.5">
      {shown.map((f) => (
        <div key={f.path} className="grid min-w-0 gap-1.5">
          <div className="flex min-w-0 items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f.path}>
              {f.path}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{size(f.size)}</span>
            <Button size="xs" variant="ghost" onClick={() => toggle(f.path)}>
              {open?.path === f.path ? "Hide" : "Read"}
            </Button>
          </div>
          {open?.path === f.path && <Text text={open.text} />}
        </div>
      ))}
      {files.length > 5 && !all && (
        <Button size="xs" variant="ghost" className="justify-self-start" onClick={() => setAll(true)}>
          {files.length - 5} more
        </Button>
      )}
      {skipped?.length ? <p className="text-xs text-muted-foreground">Passed over: {skipped.map((s) => `${s.path} (${s.why})`).join(", ")}</p> : null}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const Manual = () => <p className="text-sm text-muted-foreground">Only called by name: bots don't see it in their list, but read it when you ask for it.</p>;

// A skill's page, from its repository's current commit, and the consent to add it. Nothing is saved before Add, and a
// skill that changed since is shown again.
export function SkillDialog({ card, onAdded, onClose }: { card: SkillCard; onAdded: (addon: Plugin) => void; onClose: () => void }) {
  const [page, setPage] = useState<SkillPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = { skill: card.id, from: card.from };
  const look = () => (setPage(null), client.plugins.preview(ref).then(setPage, (e: Error) => setError(e.message)));
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

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <div className="flex min-w-0 items-center gap-2 pr-6">
            <PluginIcon iconKey={card.iconKey} />
            <DialogTitle className="truncate">{page?.name ?? card.name}</DialogTitle>
          </div>
          {(page?.description || card.description) && <DialogDescription>{page?.description || card.description}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto px-4">
          {!page && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" /> Reading {card.repository}
            </p>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {page?.error && <p className="text-sm text-destructive">{page.error}</p>}
          {page?.manual && <Manual />}
          {page && page.files.length > 0 && (
            <section className="grid gap-2">
              <h3 className={heading}>Skill</h3>
              <Files files={page.files} skipped={page.skipped} read={async (path) => (path === "SKILL.md" ? page.text : `Add it to read ${path}.`)} />
              <p className={`text-xs ${hint}`}>Nothing in a skill runs: bots read its files as text.</p>
            </section>
          )}
          <section className="grid gap-2">
            <h3 className={heading}>Information</h3>
            <Details
              rows={[
                ["Repository", page ? <span key="repo">{repoLink(card.id, page.source.commit)}, at {page.source.commit.slice(0, 7)}</span> : card.repository],
                ["License", page?.license],
                ["Installs", card.installs === undefined ? undefined : `${card.installs.toLocaleString()} on skills.sh`],
                ["Source", fromText[card.from]],
              ]}
            />
          </section>
        </div>
        {page?.hash && (
          <div className="border-t pt-3">
            <Button onClick={add} disabled={busy}>
              {busy && <LoaderCircleIcon className="animate-spin" />}
              Add {page.name}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// An installed skill: which bots have it, its files to read, and its repository, with Update when its skill changed
// there, which shows what changed and needs the owner's Update before anything moves.
export function SkillSettings({ addon, bots, onChange, onRemoved, onClose }: { addon: SkillPlugin; bots: ReactNode; onChange: (addon: Plugin) => void; onRemoved: () => void; onClose: () => void }) {
  const [next, setNext] = useState<SkillPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const look = () => (
    setLooking(true),
    setError(""),
    client.plugins.preview({ skill: addon.source.skill, from: addon.source.from }).then(setNext, (e: Error) => setError(e.message)).finally(() => setLooking(false))
  );
  const update = () => client.plugins.update(addon.id, next!.hash).then((moved) => (setNext(null), onChange(moved)), (e: Error) => setError(e.message));
  async function remove() {
    if (!confirm(`Remove ${addon.name}? It leaves every bot.`)) return;
    await client.plugins.remove(addon.id).then(onRemoved, (e: Error) => setError(e.message));
  }
  const before = new Map(addon.files.map((f) => [f.path, f.hash]));
  const after = new Map(next?.files.map((f) => [f.path, f.hash]) ?? []);
  const changes = next
    ? [
        ...[...after].filter(([p, h]) => before.has(p) && before.get(p) !== h).map(([p]) => `Changed ${p}`),
        ...[...after.keys()].filter((p) => !before.has(p)).map((p) => `Added ${p}`),
        ...[...before.keys()].filter((p) => !after.has(p)).map((p) => `Removed ${p}`),
      ]
    : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{addon.name}</DialogTitle>
          <DialogDescription>{addon.description}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 grid min-h-0 flex-1 grid-cols-1 content-start gap-5 overflow-y-auto px-4">
          {addon.manual && <Manual />}
          {bots}
          <section className="grid gap-2">
            <h3 className={heading}>Files</h3>
            <Files files={addon.files} read={(path) => client.plugins.readSkill(addon.id, path)} />
          </section>
          <section className="grid gap-2">
            <h3 className={heading}>From its repository</h3>
            {addon.mark?.kind === "removed" && <p className="text-sm text-destructive">Its repository no longer has it. It still works as added.</p>}
            <Details
              rows={[
                ["Repository", <span key="repo">{repoLink(addon.source.skill, addon.source.commit)}, at {addon.source.commit.slice(0, 7)}</span>],
                ["License", addon.license],
                ["Source", fromText[addon.source.from]],
              ]}
            />
            {addon.mark?.kind === "update" && !next && (
              <Button size="sm" variant="outline" className="justify-self-start" disabled={looking} onClick={look}>
                {looking && <LoaderCircleIcon className="animate-spin" />}
                Update to {addon.mark.version}
              </Button>
            )}
            {next && (
              <div className="grid gap-2 rounded-lg border p-3 text-sm">
                {next.error ? (
                  <p className="text-destructive">{next.error}</p>
                ) : (
                  <>
                    <p className="font-medium">What changes</p>
                    <ul className="grid gap-1 text-muted-foreground">
                      {(changes.length ? changes : ["Nothing in its files"]).map((change) => (
                        <li key={change} className="font-mono text-xs">
                          {change}
                        </li>
                      ))}
                    </ul>
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

