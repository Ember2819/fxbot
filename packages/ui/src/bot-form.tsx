import { useState, type FormEvent, type ReactNode } from "react";
import type { Profile } from "@fxbot/sdk/client";
import { Input } from "@/components/ui/input";
import { client } from "./client.ts";
import { LookEditor, plainLook } from "./look-picker.tsx";

// A new bot's name and look, on the default provider. `footer` gets whether it can't be sent yet, for a button with this
// form's id, so it can sit outside a form that scrolls.
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
        <LookEditor look={look} onChange={setLook} name={name} surface={surface}>
          <Input aria-label="Name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your bot" className="h-11" />
        </LookEditor>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      {footer(busy || !name.trim())}
    </>
  );
}
