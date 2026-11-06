import { useEffect, useState, type ReactNode } from "react";
import type { PackageCard, PackagePreview, Profile, Provider } from "@fxbot/sdk/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AddPlugins, PluginLine, readPack } from "./add-plugins.tsx";
import { BotForm } from "./bot-form.tsx";
import { client } from "./client.ts";
import { Header } from "./header.tsx";
import { ModelField, Providers } from "./providers.tsx";

const list = "grid gap-3 rounded-xl border p-3";
const readyProvider = async () => {
  const [settings, providers] = await Promise.all([client.settings.get(), client.providers.list()]);
  return providers.find((provider) => provider.id === settings.defaultProvider);
};
const later = "text-sm text-muted-foreground underline underline-offset-4";
const Step = ({ title, about, children }: { title: string; about?: string; children: ReactNode }) => (
  <section className="grid gap-3">
    <h2 className="text-xl font-medium">{title}</h2>
    {about && <p className="text-sm text-muted-foreground">{about}</p>}
    {children}
  </section>
);

// A new owner's first screens, at / until they finish or skip. `step` is a stored word, so a restart or a second device
// lands in the same place: choose, custom, adding:<names>, provider, bot, or plugins.
export function Onboarding({ step, profiles, onStep, onRefresh, onDone }: { step: string; profiles: Profile[]; onStep: (step: string) => void; onRefresh: () => void; onDone: (bot?: string) => void }) {
  const [read, setRead] = useState<{ cards: PackageCard[]; pack: PackageCard[] } | null>(null);
  const [error, setError] = useState("");
  const load = () => (setError(""), readPack().then(setRead, (e: Error) => setError(e.message)));
  useEffect(() => void load(), []);
  const move = (next: string) => (onStep(next), void client.settings.update({ onboardingStep: next }).catch(() => {}));
  const finish = (bot?: string) => void client.settings.update({ onboarded: true }).then(() => onDone(bot), (e: Error) => setError(e.message));
  const add = (names: string[]) => move(names.length ? `adding:${names.join(",")}` : "provider");
  // A bot needs a provider with a model, so that step is passed only when there's one.
  const afterAdding = () => void readyProvider().then((provider) => move(provider?.model ? "bot" : "provider"), (e: Error) => setError(e.message));

  const [kind, names] = step.split(":");
  const bot = profiles.at(-1);
  let screen: ReactNode = null;
  if (kind === "plugins" && bot)
    screen = (
      <Step title={`${bot.name} is ready`} about="To add more later, open Plugins, at the foot of the sidebar. Essentials stays at the top of Browse.">
        <Button size="lg" className="justify-self-start" onClick={() => finish(bot.id)}>
          Start chatting
        </Button>
      </Step>
    );
  else if (kind === "bot" || kind === "plugins")
    screen = (
      <Step title="Make your first bot">
        <BotForm id="first-bot" className="grid gap-6" onCreated={() => (move("plugins"), onRefresh())} footer={(disabled) => <Button type="submit" form="first-bot" className="justify-self-start" disabled={disabled}>Create</Button>} />
      </Step>
    );
  else if (kind === "provider") screen = <FirstProvider onNext={() => move("bot")} />;
  else if (!read) screen = error ? <Button className="justify-self-start" onClick={load}>Try again</Button> : null;
  else if (kind === "adding")
    screen = (
      <Step title="Adding your plugins">
        <AddPlugins cards={(names ?? "").split(",").flatMap((name) => read.cards.filter((card) => card.name === name))} onDone={afterAdding} />
      </Step>
    );
  else if (kind === "custom") screen = <Custom {...read} onAdd={add} onBack={() => move("choose")} />;
  else screen = <Choose pack={read.pack} onEssentials={() => add(read.pack.map((card) => card.name))} onCustom={() => move("custom")} />;

  return (
    <>
      <Header title="Set up fxbot" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-xl gap-6 px-4 pt-4 pb-10">
          {screen}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {kind !== "plugins" && (
            <button type="button" className={`justify-self-start ${later}`} onClick={() => finish()}>
              Skip for now
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// Essentials, with what's in it, or your own. What a plugin does to the machine is said here, before the button.
function Choose({ pack, onEssentials, onCustom }: { pack: PackageCard[]; onEssentials: () => void; onCustom: () => void }) {
  return (
    <>
      <Step title="Essentials" about="What most people want from fxbot. Recommended, and you can change it any time.">
        <ul className={list}>
          {pack.map((card) => (
            <li key={card.name}>
              <PluginLine card={card} />
              {card.note && <p className="pt-1 pl-10 text-sm font-medium">{card.note}</p>}
            </li>
          ))}
        </ul>
        <Button size="lg" className="justify-self-start" onClick={onEssentials}>
          Set up Essentials
        </Button>
      </Step>
      <button type="button" className={`justify-self-start ${later}`} onClick={onCustom}>
        Choose my own
      </button>
    </>
  );
}

// fxbot's plugins, with the pack ticked. Ticking one ticks what it needs, and unticking one unticks what needs it.
function Custom({ cards, pack, onAdd, onBack }: { cards: PackageCard[]; pack: PackageCard[]; onAdd: (names: string[]) => void; onBack: () => void }) {
  const [ticked, setTicked] = useState(() => new Set(pack.map((card) => card.name)));
  const [pages, setPages] = useState<Record<string, PackagePreview | undefined>>({});
  useEffect(() => {
    void Promise.all(cards.map((card) => client.plugins.preview({ repo: card.ref, from: card.from }).then((page) => [card.name, page] as const, () => [card.name, undefined] as const))).then((all) => setPages(Object.fromEntries(all)));
  }, []);
  const needs = (name: string) => pages[name]?.needs.map((need) => need.name) ?? [];
  function toggle(name: string, on: boolean) {
    const next = new Set(ticked);
    const walk = (each: string) => {
      if (next.has(each) === on) return;
      on ? next.add(each) : next.delete(each);
      (on ? needs(each) : cards.map((card) => card.name).filter((other) => needs(other).includes(each))).forEach(walk);
    };
    walk(name);
    setTicked(next);
  }
  // The pack's order first: a plugin after what it needs, and what reaches the machine late.
  const order = [...pack, ...cards.filter((card) => !pack.includes(card))].filter((card) => ticked.has(card.name) && !pages[card.name]?.unfit).map((card) => card.name);
  return (
    <Step title="Choose your plugins" about="You can add or remove any of them later.">
      <ul className={list}>
        {cards.map((card) => {
          const page = pages[card.name];
          return (
            <li key={card.name}>
              <label className="flex min-w-0 items-start gap-3">
                <Checkbox className="mt-1.5" aria-label={card.name} disabled={page?.unfit} checked={ticked.has(card.name) && !page?.unfit} onCheckedChange={(on) => toggle(card.name, on === true)} />
                <span className="min-w-0 flex-1">
                  <PluginLine card={card}>{page?.unfit ? <span className="text-destructive">{page.error}</span> : undefined}</PluginLine>
                  {card.note && ticked.has(card.name) && <span className="block pt-1 pl-10 text-sm font-medium">{card.note}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-3">
        <Button onClick={() => onAdd(order)}>{order.length ? `Add ${order.length} ${order.length === 1 ? "plugin" : "plugins"}` : "Continue"}</Button>
        <button type="button" className={later} onClick={onBack}>
          Back
        </button>
      </div>
    </Step>
  );
}

// A provider starts with no default model, and a bot can't answer without one, so Continue waits for both.
function FirstProvider({ onNext }: { onNext: () => void }) {
  const [provider, setProvider] = useState<Provider>();
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const read = () => void readyProvider().then((found) => (setProvider(found), setModel(found?.model ?? "")), () => {});
  useEffect(read, []);
  const next = () => void client.providers.update(provider!.id, { model }).then(onNext, (e: Error) => setError(e.message));
  return (
    <Step title="Connect a model" about="Your bots need a provider to think with: an account you sign in to, a key, or a model on your own machine.">
      {provider ? (
        <label className="grid gap-1.5 text-sm font-medium">
          The model {provider.name} uses
          <ModelField id="first-model" provider={provider.id} value={model} onChange={setModel} placeholder="Pick a model" />
        </label>
      ) : (
        <Providers defaultProvider="" onDefault={(id) => void client.settings.update({ defaultProvider: id }).then(read, () => {})} />
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="justify-self-start" disabled={!provider || !model.trim()} onClick={next}>
        Continue
      </Button>
    </Step>
  );
}
