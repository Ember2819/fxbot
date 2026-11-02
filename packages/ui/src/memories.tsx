import { useEffect, useState } from "react";
import { PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Memory, Profile } from "@fxbot/sdk/client";
import { client } from "./client.ts";

const most = 1000;
const day = (at: string) => new Date(at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

// The Memories tab: what a bot keeps, newest first, or the matches for a search. The owner adds, edits, and deletes;
// a change reaches the bot's next turn. `version` changes when a turn ends, so a memory the bot just saved shows up.
export function BotMemories({ profile, version }: { profile: Profile; version: number }) {
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Memory | null>(null);
  const [error, setError] = useState("");
  const read = () =>
    client.profiles.memories.list(profile.id, query).then(
      (list) => (setMemories(list), setError("")),
      (e: Error) => setError(e.message),
    );
  // A search waits for a pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => void read(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [profile.id, version, query]);

  const add = async () => {
    try {
      await client.profiles.memories.add(profile.id, draft);
      setDraft("");
      await read();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (memory: Memory) => {
    if (!confirm(`Delete this memory? ${profile.name} won't know it any more.`)) return;
    try {
      await client.profiles.memories.remove(profile.id, memory.id);
      await read();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="grid gap-3 pt-2">
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void add();
        }}
      >
        <Textarea aria-label="Add a memory" placeholder={`Something ${profile.name} should remember`} value={draft} maxLength={most} onChange={(e) => setDraft(e.target.value)} className="min-h-16" />
        <Button type="submit" size="sm" className="justify-self-start" disabled={!draft.trim()}>
          Add a memory
        </Button>
      </form>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search memories" placeholder="Search memories" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!memories ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !memories.length ? (
        <p className="text-sm text-muted-foreground">
          {query ? "No memories match." : `Nothing yet. ${profile.name} saves what it learns about you as you chat, and you can add your own.`}
        </p>
      ) : (
        <ul className="grid gap-2" aria-label="Memories">
          {memories.map((memory) => (
            <li key={memory.id} className="grid gap-1 rounded-lg border p-2.5 text-sm">
              <p className="whitespace-pre-line break-words">{memory.text}</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="flex-1">
                  {day(memory.updatedAt)} · {memory.savedBy === "bot" ? `Saved by ${profile.name}` : "Added by you"}
                </span>
                <Button variant="ghost" size="icon-sm" aria-label="Edit memory" onClick={() => setEditing(memory)}>
                  <PencilIcon />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete memory" onClick={() => void remove(memory)}>
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <EditMemory profile={profile} memory={editing} onDone={() => (setEditing(null), void read())} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditMemory({ profile, memory, onDone, onClose }: { profile: Profile; memory: Memory; onDone: () => void; onClose: () => void }) {
  const [text, setText] = useState(memory.text);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await client.profiles.memories.update(profile.id, memory.id, text);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit memory</DialogTitle>
          <DialogDescription>One fact, in a sentence that stands on its own. {profile.name} sees the change on its next turn.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Memory" value={text} maxLength={most} onChange={(e) => setText(e.target.value)} className="min-h-28" />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!text.trim() || text === memory.text}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
