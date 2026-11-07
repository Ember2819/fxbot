import { useState } from "react";
import { colors, faces, heads, moods, outfits, shapes, tints, type Fields } from "@fxbot/sdk/client";
import { Button } from "@/components/ui/button";
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
