import { useEffect, useRef, useState } from "react";
import { CheckIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import type { PackageCard } from "@fxbot/sdk/client";
import { Button } from "@/components/ui/button";
import { blurb } from "@/lib/utils";
import { client } from "./client.ts";
import { PluginIcon } from "./plugin-icon.tsx";
import { loadPlugins } from "./plugins.tsx";

// fxbot's plugins, and the ones in its Essentials pack, in the order to add them.
export async function readPack() {
  const { cards, essentials } = await client.plugins.searchPackages("");
  return { cards, pack: essentials.flatMap((name) => cards.filter((card) => card.name === name)) };
}

// A plugin in a list: its icon, its name, and what's under that.
export function PluginLine({ card, children }: { card: PackageCard; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <PluginIcon iconKey={card.iconKey} size={28} />
      <div className="grid min-w-0 flex-1 text-sm">
        <span className="font-medium">{card.name}</span>
        {children ?? <span className="text-muted-foreground">{blurb(card.description)}</span>}
      </div>
    </div>
  );
}

// Adds plugins from fxbot's list in order, one at a time, showing each. One that fails doesn't stop the rest, and one
// already added is passed over, so running it again is safe, after Try again, a reload, or a restart.
export function AddPlugins({ cards, onDone }: { cards: PackageCard[]; onDone: () => void }) {
  const [results, setResults] = useState<Record<string, "adding" | "added" | { error: string }>>({});
  const [finished, setFinished] = useState(false);
  const started = useRef(false);
  const failed = cards.filter((card) => typeof results[card.name] === "object");
  async function run() {
    setFinished(false);
    const mark = (name: string, result: (typeof results)[string]) => setResults((all) => ({ ...all, [name]: result }));
    let clean = true;
    for (const card of cards) {
      try {
        mark(card.name, "adding");
        if ((await client.plugins.list()).some((plugin) => plugin.name === card.name)) {
          mark(card.name, "added");
          continue;
        }
        const ref = { repo: card.ref, from: card.from };
        const page = await client.plugins.preview(ref);
        if (page.error) throw new Error(page.error);
        await client.plugins.add(ref, page.hash);
        mark(card.name, "added");
      } catch (e) {
        clean = false;
        mark(card.name, { error: (e as Error).message });
      }
    }
    await loadPlugins();
    setFinished(true);
    if (clean) onDone();
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, []);
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3" aria-label="Adding plugins">
        {cards.map((card) => {
          const result = results[card.name];
          return (
            <li key={card.name}>
              <PluginLine card={card}>
                {typeof result === "object" ? (
                  <span className="flex items-center gap-1 text-destructive"><XIcon className="size-4 shrink-0" />{result.error}</span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {result === "added" ? <CheckIcon className="size-4" /> : result === "adding" && <LoaderCircleIcon className="size-4 animate-spin" />}
                    {result === "added" ? "Added" : result === "adding" ? "Adding…" : "Waiting"}
                  </span>
                )}
              </PluginLine>
            </li>
          );
        })}
      </ul>
      {finished && failed.length > 0 && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void run()}>Try again</Button>
          <Button size="sm" variant="outline" onClick={onDone}>Continue</Button>
        </div>
      )}
    </div>
  );
}

// The pack, at the top of Browse. Each plugin in it stays its own, so it's added and removed like any other.
export function Essentials({ added, onOpen, onChange }: { added: string[]; onOpen: (card: PackageCard) => void; onChange: () => void }) {
  const [pack, setPack] = useState<PackageCard[]>([]);
  const [adding, setAdding] = useState<PackageCard[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => void readPack().then((read) => setPack(read.pack), () => {}), []);
  if (!pack.length) return null;
  const left = pack.filter((card) => !added.includes(card.name));
  return (
    <section aria-label="Essentials" className="grid gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 -space-x-2" aria-hidden="true">
          {pack.slice(0, 4).map((card) => (
            <PluginIcon key={card.name} iconKey={card.iconKey} size={28} />
          ))}
        </span>
        <div className="grid min-w-0 flex-1">
          <h2 className="font-medium">Essentials</h2>
          <p className="text-sm text-muted-foreground">What most people want from fxbot. {left.length ? `${pack.length - left.length} of ${pack.length} added.` : "All added."}</p>
        </div>
      </div>
      {adding ? (
        <AddPlugins cards={adding} onDone={() => (setAdding(null), onChange())} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {left.length > 0 && <Button size="sm" onClick={() => setAdding(left)}>{left.length === pack.length ? "Add all" : `Add the other ${left.length}`}</Button>}
          <Button size="sm" variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>What's in it</Button>
        </div>
      )}
      {open && !adding && (
        <ul className="grid gap-3">
          {pack.map((card) => (
            <li key={card.name}>
              <button type="button" className="w-full text-left outline-none hover:underline focus-visible:underline" onClick={() => onOpen(card)}>
                <PluginLine card={card} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
