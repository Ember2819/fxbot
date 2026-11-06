import { useState, type ReactNode } from "react";
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react";
import { Blob } from "./blob.tsx";
import { useAppBots } from "./plugins.tsx";

// One thing a pill counts: a message received, or sent, and the bot at the other end.
export type Folded = { sent?: boolean; name?: string; bot?: string };

// A pill in the middle of the chat, counting what a plugin folded, which it opens to show. Each bot's face and name come
// from the id the plugin gave, so two of one name aren't confused, or from the name for a message with no id.
export function Fold({ items, busy, children }: { items: Folded[]; busy?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const everyone = useAppBots() ?? [];
  const found = items.map((item) => everyone.find((bot) => bot.id === item.bot) ?? everyone.find((bot) => bot.name === item.name));
  const faces = [...new Set(found)].filter((bot) => bot !== undefined);
  const names = [...new Set(items.map((item, i) => found[i]?.name ?? item.name).filter(Boolean))].join(", ");
  const sent = items.filter((item) => item.sent).length;
  const counts = [items.length > sent && `${items.length - sent} received`, sent > 0 && `${sent} sent`].filter(Boolean).join(", ");
  return (
    <div className="grid gap-6">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mx-auto flex max-w-full items-center gap-1.5 rounded-full border bg-muted py-1 pr-3 pl-1.5 text-xs text-muted-foreground hover:text-foreground">
        {faces.length > 0 && (
          <span className="flex shrink-0 -space-x-1" aria-hidden="true">
            {faces.slice(0, 3).map((bot) => (
              <Blob key={bot.id} shape={bot.shape} color={bot.color} size={18} />
            ))}
          </span>
        )}
        {busy && <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />}
        <span className="min-w-0 truncate">
          {counts}
          {names && ` · ${names}`}
        </span>
        <ChevronRightIcon className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && children}
    </div>
  );
}
