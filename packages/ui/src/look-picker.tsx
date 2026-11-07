import { useState, type ReactNode } from "react";
import { colors, faces, heads, moods, outfits, shapes, tints, type Fields } from "@fxbot/sdk/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Blob } from "./blob.tsx";
import { fits } from "./blob-draw.ts";

export type BotLook = Pick<Fields, "shape" | "color" | "mood" | "head" | "face" | "outfit" | "tint">;
export const plainLook: BotLook = { shape: "circle", color: "blue", mood: "bright", head: "none", face: "none", outfit: "none", tint: "own" };

const title = (name: string) => name[0].toUpperCase() + name.slice(1);
const called: Record<string, string> = { none: "Nothing", calm: "Unbothered", focus: "Focused", doubt: "Doubtful", wow: "Amazed", wink: "Cheeky", swoop: "Side part", bowtie: "Bow tie", badge: "Name tag", own: "Own color" };
const named = (name: string) => called[name] ?? title(name);
const choices = { shape: shapes, color: Object.keys(colors), mood: moods, head: heads, face: faces, outfit: outfits } as Record<string, readonly string[]>;
const tabs = [["shape", "Shape"], ["color", "Color"], ["mood", "Feeling"], ["head", "Head"], ["face", "Face"], ["outfit", "Body"]] as const;
const any = (key: string) => choices[key][Math.floor(Math.random() * choices[key].length)];
const maybe = (key: string, chance: number) => (Math.random() < chance ? any(key) : "none");

// A look for **Surprise me**: any shape, color, and feeling, and something to wear, more often than not.
export const surprise = (): BotLook => ({ ...plainLook, shape: any("shape"), color: any("color"), mood: any("mood"), head: maybe("head", 0.6), face: maybe("face", 0.3), outfit: maybe("outfit", 0.6) } as BotLook);

// What a bot looks like, a tab for each part, with every choice drawn on the bot itself. The bot is the only color here.
export function LookPicker({ look, onChange }: { look: BotLook; onChange: (look: BotLook) => void }) {
  const [tab, setTab] = useState("shape");
  return (
    <Tabs value={tab} onValueChange={setTab} className="min-w-0 gap-3">
      <TabsList variant="line" className="w-full justify-between gap-0 overflow-x-auto @2xl:justify-start @2xl:gap-1">
        {tabs.map(([id, label]) => (
          <TabsTrigger key={id} value={id} className="flex-none px-1.5 @2xl:px-2.5">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(([id, label]) => (
        <TabsContent key={id} value={id} className="grid gap-3">
          <div role="group" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5">
            {choices[id].filter((choice) => id !== "head" || fits(look.shape, choice)).map((choice) => (
              <button key={choice} type="button" aria-label={named(choice)} title={named(choice)} aria-pressed={look[id] === choice} onClick={() => onChange({ ...look, [id]: choice })} className={`grid aspect-square place-items-center rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${look[id] === choice ? "ring-2 ring-foreground" : "hover:bg-muted"}`}>
                <Blob {...look} {...{ [id]: choice }} provider={undefined} size={52} still />
              </button>
            ))}
          </div>
          {(id === "head" || id === "face" || id === "outfit") && (
            <div role="group" aria-label="Clothes" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-sm text-muted-foreground">Clothes</span>
              {tints.map((tint) => (
                <Button key={tint} type="button" size="sm" variant={look.tint === tint ? "default" : "outline"} aria-pressed={look.tint === tint} onClick={() => onChange({ ...look, tint })}>
                  {named(tint)}
                </Button>
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

// The bot watching as you choose: beside the choices on a wide screen, and pinned above them on a phone, on `surface`, the
// background it sits on. Inside a @container. `children` go under the bot, such as a name.
export function LookEditor({ look, onChange, name, surface = "bg-popover", children }: { look: BotLook; onChange: (look: BotLook) => void; name: string; surface?: string; children?: ReactNode }) {
  return (
    <div className="grid gap-5 @2xl:grid-cols-[15rem_minmax(0,1fr)] @2xl:gap-8">
      <div className={`sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 ${surface} py-1 @2xl:static @2xl:flex @2xl:flex-col @2xl:items-stretch @2xl:gap-3 @2xl:py-0`}>
        <Blob {...look} size={176} follow className="size-24 @2xl:mx-auto @2xl:my-4 @2xl:size-44" />
        <div className="grid gap-2">
          {children}
          <Button type="button" variant="outline" className="h-11" onClick={() => onChange(surprise())}>
            Surprise me
          </Button>
        </div>
        <div className="mt-auto hidden items-center gap-3 pt-4 @2xl:flex">
          <Blob {...look} size={40} still />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{name.trim() || "Your bot"}</p>
            <p className="text-xs text-muted-foreground">In your sidebar</p>
          </div>
          <Blob {...look} size={24} still />
          <Blob {...look} size={16} still />
        </div>
      </div>
      <LookPicker look={look} onChange={onChange} />
    </div>
  );
}

// **Change look** on a bot's edit page: the same screen as a new bot, with a save of its own, so what you pick is either
// saved or dropped right here, and the page stays short.
export function LookDialog({ name, look, onSave }: { name: string; look: BotLook; onSave: (look: BotLook) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(look);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), next && (setDraft(look), setError("")))}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          Change look
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">{name.trim() ? `${name.trim()}'s look` : "Look"}</DialogTitle>
        </DialogHeader>
        <div className="@container grid h-[min(70dvh,34rem)] content-start gap-6 overflow-y-auto px-4 pb-6 pt-3 sm:px-6 @2xl:pt-6">
          <LookEditor look={draft} onChange={setDraft} name={name} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="mx-0 mb-0 px-6 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="rounded-full">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" className="rounded-full" disabled={busy} onClick={save}>
            Save look
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
