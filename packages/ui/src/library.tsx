import { useEffect, useState } from "react";
import { DownloadIcon, FileTextIcon, LibraryIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Streamdown } from "streamdown";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { itemKinds, type ItemKind, type LibraryItem, type LibraryPage as Page, type Profile } from "@fxbot/sdk/client";
import { Blob } from "./blob.tsx";
import { client } from "./client.ts";
import { follow } from "./nav.ts";
import { Place } from "./plugins.tsx";

const kindLabels: Record<ItemKind, string> = { image: "Images", document: "Documents" };

export const day = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
};
const bytes = (size: number) => (size < 1024 ? `${size} B` : size < 1 << 20 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1 << 20)).toFixed(1)} MB`);
const bot = (profiles: Profile[] | null, id: string | null) => (id && profiles?.find((p) => p.id === id)) || null;
// A removed bot is a plain gray circle.
const Removed = ({ size }: { size: number }) => <span aria-hidden className="inline-block shrink-0 rounded-full bg-muted-foreground/40" style={{ width: size, height: size }} />;

// An item's thumbnail: the image itself, or the kind's icon.
export function Thumb({ item, className }: { item: LibraryItem; className: string }) {
  return item.kind === "image" ? (
    <img src={item.url} alt="" loading="lazy" className={`shrink-0 rounded-md object-cover ${className}`} />
  ) : (
    <span className={`grid shrink-0 place-items-center rounded-md bg-muted text-muted-foreground ${className}`}>
      <FileTextIcon className="size-4" />
    </span>
  );
}

// The bots an item is tagged with, as small blobs: up to three, then a count.
function Bots({ ids, profiles }: { ids: (string | null)[]; profiles: Profile[] | null }) {
  return (
    <span className="flex items-center -space-x-1">
      {ids.slice(0, 3).map((id, i) => {
        const p = bot(profiles, id);
        return p ? <Blob key={id} {...p} size={20} /> : <Removed key={`removed-${i}`} size={16} />;
      })}
      {ids.length > 3 && <span className="pl-2 text-xs text-muted-foreground">+{ids.length - 3}</span>}
    </span>
  );
}

// The full page: every bot's items as even square tiles, searched and narrowed from the query string.
export function LibraryPage({ profiles }: { profiles: Profile[] | null }) {
  const start = new URLSearchParams(location.search);
  const [text, setText] = useState(start.get("q") ?? "");
  const [q, setQ] = useState(text.trim());
  const [kind, setKind] = useState<ItemKind | "">(itemKinds.find((k) => k === start.get("kind")) ?? "");
  const [profileId, setProfileId] = useState(start.get("profile") ?? "");
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<LibraryItem | null>(null);

  useEffect(() => {
    const wait = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(wait);
  }, [text]);
  // Kept in the query string, so Back from a chat comes back to the same view.
  const query = { q: q || undefined, kind: kind || undefined, profileId: profileId || undefined };
  useEffect(() => {
    const params = new URLSearchParams(Object.entries({ q, kind, profile: profileId }).filter(([, value]) => value));
    history.replaceState(null, "", `/library${params.size ? `?${params}` : ""}`);
    let stopped = false;
    client.library.list(query).then(
      (loaded) => !stopped && (setPage(loaded), setError("")),
      (e: Error) => !stopped && setError(e.message),
    );
    return () => {
      stopped = true;
    };
  }, [q, kind, profileId]);

  const more = () =>
    page?.next &&
    client.library.list({ ...query, before: page.next }).then(
      (loaded) => setPage((current) => current && { items: [...current.items, ...loaded.items], next: loaded.next }),
      (e: Error) => setError(e.message),
    );
  const removed = (id: string) => setPage((current) => current && { ...current, items: current.items.filter((item) => item.id !== id) });
  const filtered = Boolean(q || kind || profileId);

  return (
    <>
      <header className="box-content flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
        <SidebarTrigger />
        <h1 className="font-medium">Library</h1>
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="mx-auto grid max-w-5xl gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" aria-label="Search the library" placeholder="Search names and text" value={text} onChange={(e) => setText(e.target.value)} className="pl-8" />
            </div>
            <div className="flex gap-1" role="group" aria-label="Kind">
              {(["", ...itemKinds] as const).map((k) => (
                <Button key={k} size="sm" variant={kind === k ? "secondary" : "ghost"} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k ? kindLabels[k] : "All"}
                </Button>
              ))}
            </div>
            <NativeSelect aria-label="Bot" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
              <NativeSelectOption value="">All bots</NativeSelectOption>
              {profiles?.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {page && !page.items.length && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LibraryIcon />
                </EmptyMedia>
                <EmptyTitle>{filtered ? "No matches" : "Nothing in the library yet"}</EmptyTitle>
                <EmptyDescription>
                  {q ? `Nothing matches “${q}”${kind || profileId ? " with these filters" : ""}.` : filtered ? "Nothing matches these filters." : "Images and files you send, and documents bots save, show up here."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {page?.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setOpen(item)} aria-label={`Open ${item.name}`} className="flex aspect-square w-full flex-col overflow-hidden rounded-xl border text-left transition-colors hover:bg-muted/50">
                  {item.kind === "image" ? (
                    <img src={item.url} alt={item.name} loading="lazy" className="min-h-0 w-full flex-1 bg-muted object-cover" />
                  ) : (
                    <span className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
                      <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{item.name}</span>
                      <span className="line-clamp-4 text-xs break-words whitespace-pre-line text-muted-foreground">{item.preview}</span>
                    </span>
                  )}
                  <span className="flex h-8 shrink-0 items-center justify-between gap-2 border-t px-2 text-xs text-muted-foreground">
                    {day(item.savedAt)}
                    <Bots ids={item.profileIds} profiles={profiles} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {page?.next && (
            <Button variant="outline" className="justify-self-center" onClick={more}>
              Load more
            </Button>
          )}
        </div>
      </main>
      {open && <Preview item={open} profiles={profiles} onClose={() => setOpen(null)} onRemoved={removed} />}
    </>
  );
}

// One item, from the full page or a bot's panel: the file, where it came from, Download, and Delete.
export function Preview({ item, profiles, onClose, onRemoved }: { item: LibraryItem; profiles: Profile[] | null; onClose: () => void; onRemoved: (id: string) => void }) {
  // A listing narrowed to one bot names only that bot's tags, so the preview reads the item's own.
  const [tags, setTags] = useState(item.profileIds);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    client.library.get(item.id).then((full) => setTags(full.profileIds), (e: Error) => setError(e.message));
    if (item.kind === "document")
      fetch(item.url)
        .then((res) => (res.ok ? res.text() : Promise.reject(new Error("This file is gone."))))
        .then(setText, (e: Error) => setError(e.message));
  }, [item.id]);

  async function remove() {
    if (!confirm(`Remove ${item.name} from the library, for every bot? The chats it came from keep what the bots saw.`)) return;
    try {
      await client.library.remove(item.id);
      onRemoved(item.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const markdown = item.type === "text/markdown" || /\.(md|markdown)$/i.test(item.name);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{item.name}</DialogTitle>
          <DialogDescription>
            {item.origin === "uploaded" ? "Sent by you" : "Made by a bot"} · {day(item.createdAt)} · {bytes(item.size)}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          {item.kind === "image" ? (
            <img src={item.url} alt={item.name} className="mx-auto max-h-[60dvh]" />
          ) : text === null ? (
            <p className="p-3 text-sm text-muted-foreground">{error ? "" : "Loading…"}</p>
          ) : markdown ? (
            <div className="p-4 text-sm">
              <Streamdown>{text}</Streamdown>
            </div>
          ) : (
            <pre className="p-3 text-xs break-words whitespace-pre-wrap">{text}</pre>
          )}
        </div>
        <div className="grid gap-1.5 text-sm">
          <span className="text-muted-foreground">From the chats of</span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {tags.map((id, i) => {
              const p = bot(profiles, id);
              return (
                <li key={id ?? `removed-${i}`} className="flex items-center gap-1.5">
                  {p ? (
                    <a href={`/profiles/${p.id}`} onClick={(e) => (follow(e), onClose())} className="flex items-center gap-1.5 underline-offset-4 hover:underline">
                      <Blob {...p} size={20} />
                      {p.name}
                    </a>
                  ) : (
                    <>
                      <Removed size={16} />
                      <span className="text-muted-foreground">Removed bot</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <a href={`${item.url}?download=1`} className={buttonVariants({ variant: "outline" })}>
            <DownloadIcon />
            Download
          </a>
          <Place pick={(places) => places.libraryItem} props={{ item }} />
          <Button variant="destructive" onClick={remove}>
            <Trash2Icon />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
