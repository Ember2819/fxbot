import { useState, type FormEvent, type ReactNode } from "react";
import type { Profile } from "@fxbot/sdk/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Blob } from "./blob.tsx";
import { client } from "./client.ts";
import { LookPicker, plainLook, surprise } from "./look-picker.tsx";

// A new bot's name and look, on the default provider. The bot watches as you choose: beside the choices on a wide screen,
// and pinned above them on a phone, on `surface`, the background it sits on. `footer` gets whether it can't be sent yet, for a button with this form's id, so it
// can sit outside a form that scrolls.
export function BotForm({ id, className, surface = "bg-popover", onCreated, footer }: { id: string; className?: string; surface?: string; onCreated: (profile: Profile) => void; footer: (disabled: boolean) => ReactNode }) {
  const [name, setName] = useState("");
  const [look, setLook] = useState(plainLook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = await client.profiles.create({ name, ...look });
      setName("");
      onCreated(profile);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <>
      <form id={id} onSubmit={create} className={`@container ${className}`}>
        <div className="grid gap-5 @2xl:grid-cols-[15rem_minmax(0,1fr)] @2xl:gap-8">
          <div className={`sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 ${surface} py-1 @2xl:static @2xl:flex @2xl:flex-col @2xl:items-stretch @2xl:gap-3 @2xl:py-0`}>
            <Blob {...look} size={176} follow className="size-24 @2xl:mx-auto @2xl:my-4 @2xl:size-44" />
            <div className="grid gap-2">
              <Input aria-label="Name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your bot" className="h-11" />
              <Button type="button" variant="outline" className="h-11" onClick={() => setLook(surprise())}>
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
          <LookPicker look={look} onChange={setLook} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      {footer(busy || !name.trim())}
    </>
  );
}
