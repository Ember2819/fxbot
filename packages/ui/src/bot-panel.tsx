import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LibraryItem, Profile, Provider } from "@fxbot/sdk/client";
import { client } from "./client.ts";
import { Preview, Thumb } from "./library.tsx";
import { follow } from "./nav.ts";

type Tab = "details" | "library";

// Storage can be off, as in a private window; the panel then starts closed on the Details tab.
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

// Whether the panel is open, and its tab, per browser.
export function usePanel() {
  const [open, setOpen] = useState(() => read("fxbot.panel") === "open");
  const [tab, setTab] = useState<Tab>(() => (read("fxbot.panel.tab") === "library" ? "library" : "details"));
  return {
    open,
    tab,
    setOpen: (next: boolean) => (setOpen(next), write("fxbot.panel", next ? "open" : "closed")),
    setTab: (next: Tab) => (setTab(next), write("fxbot.panel.tab", next)),
  };
}

// The right panel beside a bot's chat: a 360-pixel column from `md` up, a sheet on a phone. `version` changes when a
// turn ends, so the Library tab reads the list again and shows what the bot saved.
export function BotPanel({ profile, profiles, panel, version }: { profile: Profile; profiles: Profile[] | null; panel: ReturnType<typeof usePanel>; version: number }) {
  const mobile = useIsMobile();
  // The bot is the one picked in the sidebar, so the panel goes straight to its tabs.
  const body = (
    <Tabs value={panel.tab} onValueChange={(tab) => panel.setTab(tab as Tab)} className="min-h-0 flex-1 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        <TabsList className="flex-1">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={() => panel.setOpen(false)}>
          <XIcon />
        </Button>
      </div>
      <TabsContent value="details" className="min-h-0 overflow-y-auto pb-4">
        <Details profile={profile} />
      </TabsContent>
      <TabsContent value="library" className="min-h-0 overflow-y-auto pb-4">
        <BotLibrary profile={profile} profiles={profiles} version={version} />
      </TabsContent>
    </Tabs>
  );
  if (mobile)
    return (
      <Sheet open={panel.open} onOpenChange={panel.setOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-sm">
          <SheetTitle className="sr-only">{profile.name}</SheetTitle>
          <SheetDescription className="sr-only">Details and library</SheetDescription>
          {body}
        </SheetContent>
      </Sheet>
    );
  if (!panel.open) return null;
  return (
    <aside aria-label={`${profile.name} panel`} className="flex w-[360px] shrink-0 flex-col border-l">
      {body}
    </aside>
  );
}

function Details({ profile }: { profile: Profile }) {
  const [provider, setProvider] = useState<Provider | null>(null);
  useEffect(() => {
    client.providers.list().then((list) => setProvider(list.find((p) => p.id === profile.provider) ?? null), () => {});
  }, [profile.provider]);
  const row = "grid gap-0.5 text-sm";
  return (
    <div className="grid gap-4 pt-2">
      <div className={row}>
        <span className="text-muted-foreground">Provider</span>
        <span>{profile.provider ? (provider?.name ?? "…") : "None"}</span>
      </div>
      <div className={row}>
        <span className="text-muted-foreground">Model</span>
        <span className="break-all">{profile.model || (provider?.model ? `${provider.model} (the provider's default)` : "The provider's default")}</span>
      </div>
      <div className={row}>
        <span className="text-muted-foreground">Instructions</span>
        <span className="line-clamp-4 whitespace-pre-line">{profile.instructions || "None"}</span>
      </div>
      <a href={`/profiles/${profile.id}/edit`} onClick={follow} className={`${buttonVariants({ variant: "outline" })} justify-self-start`}>
        Edit
      </a>
    </div>
  );
}

const week = 7 * 24 * 60 * 60 * 1000;

// This bot's items in two cards, "This week" and "Older". Each shows 5 rows, and "Show more" 20 more, reading the
// next page when the loaded ones run out.
function BotLibrary({ profile, profiles, version }: { profile: Profile; profiles: Profile[] | null; version: number }) {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [shown, setShown] = useState({ recent: 5, older: 5 });
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    client.library.list({ profileId: profile.id }).then(
      (page) => (setItems(page.items), setNext(page.next), setError("")),
      (e: Error) => setError(e.message),
    );
  }, [profile.id, version]);

  if (error) return <p className="pt-2 text-sm text-destructive">{error}</p>;
  if (!items) return <p className="pt-2 text-sm text-muted-foreground">Loading…</p>;
  if (!items.length) return <p className="pt-2 text-sm text-muted-foreground">Nothing saved yet. Files you send {profile.name}, and documents it saves, show up here.</p>;

  const since = Date.now() - week;
  const groups = { recent: items.filter((i) => Date.parse(i.savedAt) >= since), older: items.filter((i) => Date.parse(i.savedAt) < since) };
  async function more(group: keyof typeof groups) {
    const want = shown[group] + 20;
    setShown({ ...shown, [group]: want });
    if (!next || groups[group].length >= want) return;
    try {
      const page = await client.library.list({ profileId: profile.id, before: next });
      setItems((current) => [...(current ?? []), ...page.items]);
      setNext(page.next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  // Newest first, so a page that ends in this week's items may hold more of them, and older ones always may.
  const hasMore = (group: keyof typeof groups) => groups[group].length > shown[group] || (Boolean(next) && (group === "older" || !groups.older.length));
  const card = (group: keyof typeof groups, title: string) =>
    groups[group].length > 0 && (
      <section aria-label={title} className="rounded-xl border">
        <h3 className="px-3 pt-2.5 pb-1 text-sm font-medium">{title}</h3>
        <ul>
          {groups[group].slice(0, shown[group]).map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setOpen(item)} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-muted/50">
                <Thumb item={item} className="size-7" />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {hasMore(group) && (
          <button type="button" onClick={() => more(group)} className="w-full border-t px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground">
            Show more
          </button>
        )}
      </section>
    );
  return (
    <div className="grid gap-3 pt-2">
      {card("recent", "This week")}
      {card("older", "Older")}
      {open && <Preview item={open} profiles={profiles} onClose={() => setOpen(null)} onRemoved={(id) => setItems((current) => current?.filter((i) => i.id !== id) ?? null)} />}
    </div>
  );
}
