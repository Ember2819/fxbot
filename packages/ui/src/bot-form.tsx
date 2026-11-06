import { useState, type FormEvent, type ReactNode } from "react";
import type { Color, Profile, Shape } from "@fxbot/sdk/client";
import { Input } from "@/components/ui/input";
import { Blob, LookPicker } from "./blob.tsx";
import { client } from "./client.ts";

// A new bot's name and look, on the default provider. `footer` gets whether it can't be sent yet, for a button with this
// form's id, so it can sit outside a form that scrolls.
export function BotForm({ id, className, onCreated, footer }: { id: string; className?: string; onCreated: (profile: Profile) => void; footer: (disabled: boolean) => ReactNode }) {
  const [name, setName] = useState("");
  const [shape, setShape] = useState<Shape>("circle");
  const [color, setColor] = useState<Color>("brown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = await client.profiles.create({ name, shape, color });
      setName("");
      onCreated(profile);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <>
      <form id={id} onSubmit={create} className={className}>
        <Blob shape={shape} color={color} size={112} follow className="mx-auto" />
        <Input aria-label="Name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your Bot" className="h-12 rounded-xl text-center text-lg" />
        <LookPicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
      {footer(busy || !name.trim())}
    </>
  );
}
