import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CheckIcon, ChevronsUpDownIcon, CopyIcon, ExternalLinkIcon, LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { kinds, type Kind, type Model, type Provider, type SignIn, type Team } from "@fxbot/sdk/client";
import { client } from "./client.ts";

const label = "grid gap-1.5 text-sm font-medium";
const hint = "font-normal text-muted-foreground";
const groups = [
  ["Sign in", "device"],
  ["API key", "key"],
  ["Server", "url"],
] as const;

// A provider's models. The server answers with the list it kept, and fetches a fresh one behind that answer when it is
// old, so `load` again, as when the picker opens, brings the new one. `version` starts over, as after a Vercel account
// picks its team.
export function useModels(provider: string, version = "") {
  const [models, setModels] = useState<Model[] | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    if (provider) client.providers.models(provider).then((list) => (setModels(list), setError("")), (e: Error) => setError(e.message));
  };
  useEffect(() => {
    setModels(null);
    setError("");
    load();
  }, [provider, version]);
  return { models, error, load };
}

// A model picked from the provider's list. It opens on every model, the current one marked, and narrows as you type;
// an id the list lacks can be used as typed.
export function ModelField({ id, provider, version, value, onChange, placeholder }: { id: string; provider: string; version?: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const { models, error, load } = useModels(provider, version);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const typed = query.trim();
  const q = typed.toLowerCase();
  const shown = (models ?? []).filter((m) => !q || m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q));
  // An id the list lacks comes last, so Enter takes the first match and the typed id only when nothing matches.
  const options = [...shown, ...(typed && !models?.some((m) => m.id === typed) ? [{ id: typed, name: "Use this id" }] : [])];
  const optionId = (i: number) => `models-${id}-${i}`;

  function toggle(next: boolean) {
    setOpen(next);
    if (!next) return;
    setQuery("");
    setActive(Math.max(0, (models ?? []).findIndex((m) => m.id === value)));
    load();
  }
  const pick = (model: string) => (onChange(model), setOpen(false));
  // The marked option stays in view as the arrows move it, and the current model is in view on opening.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [open, active, models]);
  function keys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.min(Math.max(i + (event.key === "ArrowDown" ? 1 : -1), 0), Math.max(options.length - 1, 0)));
    } else if (event.key === "Enter" && options[active]) {
      event.preventDefault();
      pick(options[active].id);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={toggle}>
        <PopoverTrigger asChild disabled={!provider}>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between px-3 font-normal">
            <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>{value || placeholder}</span>
            <ChevronsUpDownIcon className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 gap-0 p-0">
          <Input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={`models-${id}`}
            aria-activedescendant={options[active] ? optionId(active) : undefined}
            aria-label="Search models, or type a model id"
            placeholder="Search, or type a model id"
            className="rounded-b-none border-0 border-b shadow-none focus-visible:ring-0"
            value={query}
            onChange={(e) => (setQuery(e.target.value), setActive(0))}
            onKeyDown={keys}
          />
          <div ref={list} id={`models-${id}`} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {models === null && !error && (
              <p className="flex items-center gap-2 p-2 text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" /> Loading models
              </p>
            )}
            {models !== null && options.length === 0 && <p className="p-2 text-muted-foreground">This provider lists no models.</p>}
            {options.map((m, i) => (
              <div
                key={m.id + i}
                id={optionId(i)}
                role="option"
                aria-selected={m.id === value}
                className={`flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 ${i === active ? "bg-accent text-accent-foreground" : ""}`}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.id}</span>
                  {m.name && m.name !== m.id && <span className="block truncate text-xs text-muted-foreground">{m.name}</span>}
                </span>
                {m.id === value && <CheckIcon className="size-4 shrink-0" />}
              </div>
            ))}
          </div>
          {(error || value) && (
            <div className="flex items-center gap-2 border-t p-1.5">
              {error && <span className="min-w-0 flex-1 px-1 text-xs text-destructive">{error}</span>}
              {error && (
                <Button type="button" size="xs" variant="ghost" onClick={load}>
                  Try again
                </Button>
              )}
              {value && (
                <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => pick("")}>
                  Clear
                </Button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {error && !open && <span className="font-normal text-destructive">{error}</span>}
    </>
  );
}

// Settings' providers: a row for each, and an Add list like eve's /login. Keys go to the server once and never back.
export function Providers({ defaultProvider, onDefault }: { defaultProvider: string; onDefault: (id: string) => void }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<{ kind: Kind; provider?: Provider } | null>(null);
  const load = () => client.providers.list().then(setProviders, (e: Error) => setError(e.message));
  useEffect(() => void load(), []);
  const done = (id?: string) => {
    setAdding(null);
    load();
    if (id && !defaultProvider) onDefault(id);
  };

  return (
    <section className="grid gap-3" aria-label="Providers">
      <h2 className="font-medium">Providers</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {providers?.length === 0 && <p className="text-sm text-muted-foreground">No providers yet. Add one to start chatting.</p>}
      {providers?.map((p) => (
        <ProviderRow key={p.id} provider={p} isDefault={p.id === defaultProvider} onDefault={() => onDefault(p.id)} onChange={load} onReconnect={() => setAdding({ kind: p.kind, provider: p })} />
      ))}
      <NativeSelect className="w-full" aria-label="Add provider" value="" onChange={(e) => e.target.value && setAdding({ kind: e.target.value as Kind })}>
        <NativeSelectOption value="">Add provider…</NativeSelectOption>
        {groups.map(([title, connect]) => (
          <NativeSelectOptGroup key={connect} label={title}>
            {(Object.keys(kinds) as Kind[])
              .filter((kind) => kinds[kind].connect === connect)
              .map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {kinds[kind].label}
                </NativeSelectOption>
              ))}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
      {adding && kinds[adding.kind].connect === "device" ? (
        <SignInDialog kind={adding.kind} provider={adding.provider} onDone={done} onClose={() => setAdding(null)} />
      ) : adding ? (
        <KeyDialog kind={adding.kind} provider={adding.provider} onDone={done} onClose={() => setAdding(null)} />
      ) : null}
    </section>
  );
}

function ProviderRow({ provider: p, isDefault, onDefault, onChange, onReconnect }: { provider: Provider; isDefault: boolean; onDefault: () => void; onChange: () => void; onReconnect: () => void }) {
  const [model, setModel] = useState(p.model);
  const [context, setContext] = useState(p.contextWindow ? String(p.contextWindow) : "");
  const [teams, setTeams] = useState<Team[]>([]);
  const [status, setStatus] = useState("");
  const connect = kinds[p.kind].connect;
  useEffect(() => {
    if (p.kind === "vercel" && p.signedIn) client.providers.teams(p.id).then(setTeams, (e: Error) => setStatus(e.message));
  }, [p.id]);

  async function run(action: () => Promise<unknown>, done = "Saved.") {
    setStatus("");
    try {
      await action();
      setStatus(done);
      onChange();
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  const save = (event: FormEvent) => {
    event.preventDefault();
    run(() => client.providers.update(p.id, { model, ...(connect === "url" ? { contextWindow: context ? Number(context) : null } : {}) }));
  };
  // Local servers need no key, so they show no key state.
  const state = p.error ?? (p.signedIn ? "Signed in" : p.hasKey ? "Key saved" : connect === "device" ? "Not signed in" : p.kind === "custom" ? "No key" : "");
  const about = p.name === kinds[p.kind].label ? "" : kinds[p.kind].label;

  return (
    <form onSubmit={save} className="grid gap-3 rounded-xl border p-3" aria-label={p.name}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{p.name}</span>
        {about && <span className="text-sm text-muted-foreground">{about}</span>}
        {isDefault && <span className="text-sm text-muted-foreground">· Default</span>}
        <span className={`ml-auto text-sm ${p.error ? "text-destructive" : "text-muted-foreground"}`}>{state}</span>
      </div>
      {p.baseUrl && <span className="truncate text-sm text-muted-foreground">{p.baseUrl}</span>}
      <label className={label}>
        Default model
        <ModelField id={p.id} provider={p.id} version={p.teamId ?? ""} value={model} onChange={setModel} placeholder="A model this provider serves" />
      </label>
      {connect === "url" && (
        <label className={label}>
          Context window
          <Input inputMode="numeric" value={context} onChange={(e) => setContext(e.target.value.replace(/\D/g, ""))} placeholder="As the server reports" />
          <span className={hint}>Tokens. For Ollama, match the server's OLLAMA_CONTEXT_LENGTH.</span>
        </label>
      )}
      {p.kind === "vercel" && teams.length > 0 && (
        <label className={label}>
          Team
          <NativeSelect className="w-full" value={p.teamId ?? ""} onChange={(e) => run(() => client.providers.update(p.id, { teamId: e.target.value }))}>
            {!p.teamId && <NativeSelectOption value="">Pick a team…</NativeSelectOption>}
            {teams.map((t) => (
              <NativeSelectOption key={t.id} value={t.id}>
                {t.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          Save
        </Button>
        {!isDefault && (
          <Button type="button" size="sm" variant="outline" onClick={onDefault}>
            Make default
          </Button>
        )}
        {(connect === "device" || connect === "key" || p.kind === "custom") && (
          <Button type="button" size="sm" variant="outline" onClick={onReconnect}>
            {connect === "device" ? "Sign in again" : "Replace key"}
          </Button>
        )}
        <Button type="button" size="sm" variant="destructive" onClick={() => confirm(`Remove ${p.name}? Its key or sign-in is deleted.`) && run(() => client.providers.remove(p.id), "Removed.")}>
          Remove
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
    </form>
  );
}

function Frame({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

// A device code sign-in: the server holds what claims the tokens; the page shows the code and checks every 3 seconds.
function SignInDialog({ kind, provider, onDone, onClose }: { kind: Kind; provider?: Provider; onDone: (id: string) => void; onClose: () => void }) {
  const [signIn, setSignIn] = useState<SignIn | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false;
    let current: SignIn | null = null;
    setError("");
    setSignIn(null);
    client.signIns.start(kind, provider?.id).then(
      (started) => {
        if (stopped) return void client.signIns.cancel(started.id).catch(() => {});
        current = started;
        setSignIn(started);
      },
      (e: Error) => setError(e.message),
    );
    const poll = setInterval(async () => {
      if (!current) return;
      const status = await client.signIns.get(current.id).catch(() => null);
      if (status?.status === "done") onDone(status.provider!);
      if (status?.status === "failed") (setError(status.error ?? "The sign-in failed."), (current = null));
    }, 3000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(tick);
      if (current) client.signIns.cancel(current.id).catch(() => {});
    };
  }, [kind, attempt]);

  const left = signIn ? Math.max(0, Math.round((signIn.expiresAt - now) / 1000)) : 0;
  const copy = () => signIn && navigator.clipboard.writeText(signIn.userCode).then(() => (setCopied(true), setTimeout(() => setCopied(false), 2000)));
  return (
    <Frame title={`Sign in: ${kinds[kind].label}`} description="Open the link on any device, sign in, and enter this code. This page finishes on its own." onClose={onClose}>
      {error ? (
        <div className="grid gap-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      ) : !signIn ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" /> Getting a code…
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center justify-center gap-2">
            <code aria-label="Sign-in code" className="rounded-lg bg-muted px-4 py-2 font-mono text-2xl tracking-widest">
              {signIn.userCode}
            </code>
            <Button variant="ghost" size="icon" aria-label="Copy code" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
          <a href={signIn.verificationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-sm font-medium underline underline-offset-4">
            Open {new URL(signIn.verificationUrl).host} <ExternalLinkIcon className="size-4" />
          </a>
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" /> Waiting · {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
          </p>
        </div>
      )}
    </Frame>
  );
}

// A key or a server's address. Replacing a key on an existing provider asks for the key alone.
function KeyDialog({ kind, provider, onDone, onClose }: { kind: Kind; provider?: Provider; onDone: (id: string) => void; onClose: () => void }) {
  const preset = kinds[kind];
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("baseUrl" in preset ? preset.baseUrl : "");
  const [apiKey, setApiKey] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const wantsKey = preset.connect === "key" || kind === "custom";
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = provider
        ? await client.providers.update(provider.id, { apiKey })
        : await client.providers.add({ kind, name, apiKey, ...(preset.connect === "url" ? { baseUrl, contextWindow: context ? Number(context) : null } : {}) });
      setApiKey("");
      onDone(saved.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Frame title={provider ? `Replace key: ${provider.name}` : `Add ${preset.label}`} description="The key goes to the server, sealed, and never comes back to this page." onClose={onClose}>
      <form onSubmit={save} className="grid gap-4">
        {!provider && (
          <label className={label}>
            Name
            <Input maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder={preset.label} />
          </label>
        )}
        {!provider && preset.connect === "url" && (
          <label className={label}>
            Address
            <Input required value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://host/v1" />
            <span className={hint}>An OpenAI-compatible API with its /v1. HTTPS, or HTTP on localhost.</span>
          </label>
        )}
        {wantsKey && (
          <label className={label}>
            API key
            <Input type="password" autoComplete="off" required={preset.connect === "key" || !!provider} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
        )}
        {!provider && preset.connect === "url" && (
          <label className={label}>
            Context window
            <Input inputMode="numeric" value={context} onChange={(e) => setContext(e.target.value.replace(/\D/g, ""))} placeholder="As the server reports" />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Save"}
        </Button>
      </form>
    </Frame>
  );
}
