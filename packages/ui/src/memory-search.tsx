import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { embeddingKinds, type EmbeddingStatus, type LocalEmbedder, type Provider, type Settings } from "@fxbot/sdk/client";
import { client } from "./client.ts";

type Choice = "cpu" | "gpu" | "remote" | "off";
// A model id the way people say it: embeddinggemma-2, not ggml-org/embeddinggemma-2-GGUF:Q8_0.
const short = (model: string) => model.split("/").pop()!.replace(/:.*$/, "").replace(/-GGUF$/i, "");
const suggested: Partial<Record<Provider["kind"], string>> = {
  openai: "text-embedding-3-small",
  openrouter: "openai/text-embedding-3-small",
  gateway: "openai/text-embedding-3-small",
  vercel: "openai/text-embedding-3-small",
  ollama: "nomic-embed-text",
};

// Settings' Memory search: where memory search's vectors come from, whether chat messages get them, and how far they've
// got. A local choice asks the machine to run its embedder on the CPU or a GPU, in an install made by setup.sh.
export function MemorySearch() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [remote, setRemote] = useState({ provider: "", model: "" });
  const [characters, setCharacters] = useState("");
  const [picked, setPicked] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = () =>
    Promise.all([client.settings.get(), client.settings.embedding()]).then(([next, now]) => {
      setSettings(next);
      setStatus(now);
      setRemote((r) => (r.provider ? r : { provider: next.embeddingProvider, model: next.embeddingModel }));
      setCharacters((c) => c || String(next.messageVectors || 8000));
    }, (e: Error) => setError(e.message));
  useEffect(() => {
    void read();
    client.providers.list().then((list) => setProviders(list.filter((p) => (embeddingKinds as readonly string[]).includes(p.kind))), () => {});
  }, []);
  // While vectors fill in, or the machine switches its embedder, the line keeps up.
  const filling = Boolean(status && (status.switching || (status.model && (status.withVectors < status.messages || status.memoriesWithVectors < status.memories))));
  useEffect(() => {
    if (!filling) return;
    const timer = setInterval(() => client.settings.embedding().then(setStatus, () => {}), 3000);
    return () => clearInterval(timer);
  }, [filling]);
  if (!settings || !status) return error ? <p className="text-sm text-destructive">{error}</p> : null;

  const current: Choice = settings.embedder === "local" ? (status.local === "gpu" ? "gpu" : "cpu") : settings.embedder;
  const choice = picked ?? current;
  const save = async (fields: Partial<Settings> & { local?: LocalEmbedder }) => {
    setBusy(true);
    try {
      setSettings(await client.settings.update(fields));
      setPicked(null);
      setError("");
      setStatus(await client.settings.embedding());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const local = (which?: LocalEmbedder) => (status.canSwitch && which ? { local: which } : {});
  const pick = (next: Choice) => {
    setPicked(next);
    if (next === "cpu" || next === "gpu") void save({ embedder: "local", ...local(next) });
    if (next === "off") void save({ embedder: "off", ...local("off") });
  };
  const provider = providers.find((p) => p.id === remote.provider);

  let line: string;
  if (status.switching?.error) line = status.switching.error;
  else if (status.switching) line = `Switching the local embedder to ${status.switching.to === "gpu" ? "the GPU" : status.switching.to === "cpu" ? "the CPU" : "off"}…`;
  else if (settings.embedder === "off") line = "Off: memories and earlier chats are searched by words.";
  else if (!status.model) line = status.error ?? "Waiting for the embedder.";
  else {
    const where = settings.embedder === "remote" ? `from ${providers.find((p) => p.id === settings.embeddingProvider)?.name ?? "its provider"}` : status.local === "gpu" ? "on the GPU" : "on the CPU";
    const counts = [`${status.memoriesWithVectors.toLocaleString()} of ${status.memories.toLocaleString()} memories`];
    if (settings.messageVectors) counts.push(`${status.withVectors.toLocaleString()} of ${status.messages.toLocaleString()} messages`);
    line = `On: ${short(status.model)} ${where}. ${counts.join(" and ")} have vectors.`;
  }
  const bad = Boolean(status.switching?.error || (status.error && settings.embedder !== "off"));

  return (
    <section className="grid gap-3" aria-label="Memory search">
      <h2 className="font-medium">Memory search</h2>
      <p className="text-sm text-muted-foreground">Bots find their memories and earlier chats by words, and by meaning with vectors from an embedding model.</p>
      <label className="grid gap-1.5 text-sm">
        Where vectors come from
        <NativeSelect className="w-full" value={choice} disabled={busy} onChange={(e) => pick(e.target.value as Choice)}>
          <NativeSelectOption value="cpu">Local, on the CPU</NativeSelectOption>
          <NativeSelectOption value="gpu" disabled={!status.canSwitch}>
            Local, on a GPU{status.canSwitch ? "" : " (an install made by setup.sh)"}
          </NativeSelectOption>
          <NativeSelectOption value="remote">A provider's embedding model</NativeSelectOption>
          <NativeSelectOption value="off">Off: words only</NativeSelectOption>
        </NativeSelect>
      </label>
      {choice === "remote" && (
        <form
          className="grid gap-3 rounded-xl border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ embedder: "remote", embeddingProvider: remote.provider, embeddingModel: remote.model, ...local("off") });
          }}
        >
          {providers.length ? (
            <>
              <label className="grid gap-1.5 text-sm">
                Provider
                <NativeSelect className="w-full" value={remote.provider} onChange={(e) => setRemote({ provider: e.target.value, model: remote.model || suggested[providers.find((p) => p.id === e.target.value)?.kind ?? "custom"] || "" })}>
                  <NativeSelectOption value="">Pick a provider…</NativeSelectOption>
                  {providers.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 text-sm">
                Embedding model
                <Input value={remote.model} onChange={(e) => setRemote({ ...remote, model: e.target.value })} placeholder={(provider && suggested[provider.kind]) || "An embedding model this provider serves"} />
              </label>
              <Button type="submit" size="sm" className="justify-self-start" disabled={busy || !remote.provider || !remote.model.trim()}>
                {busy ? "Trying it…" : "Use this model"}
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">None of your providers serves embeddings. OpenAI, OpenRouter, AI Gateway, Ollama, LM Studio, and other servers do.</p>
          )}
        </form>
      )}
      {settings.embedder !== "off" && (
        <div className="grid gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={settings.messageVectors > 0} disabled={busy} onCheckedChange={(on) => void save({ messageVectors: on ? Number(characters) || 8000 : 0 })} />
            Vectors for chat messages too, for earlier chats
          </label>
          {settings.messageVectors > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-muted-foreground">
              From the first
              <Input
                inputMode="numeric"
                className="w-24"
                value={characters}
                onChange={(e) => setCharacters(e.target.value.replace(/\D/g, ""))}
                onBlur={() => Number(characters) !== settings.messageVectors && Number(characters) > 0 && void save({ messageVectors: Math.min(Number(characters), 100_000) })}
              />
              characters of each
            </label>
          )}
        </div>
      )}
      <p className={`text-sm ${bad ? "text-destructive" : "text-muted-foreground"}`} role="status">
        {line}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
