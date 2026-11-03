import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowUpIcon, CheckIcon, ChevronRightIcon, CopyIcon, FileTextIcon, LayoutDashboardIcon, MessageCircleDashedIcon, PanelRightIcon, PaperclipIcon, PinIcon, PinOffIcon, PlusIcon, PuzzleIcon, SettingsIcon, XIcon } from "lucide-react";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentGroup, AttachmentMedia, AttachmentTitle, AttachmentTrigger } from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageContent, MessageFooter } from "@/components/ui/message";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { colors, maxPinned, unreachable, type Color, type Fields, type Profile, type Provider, type Settings, type Shape, type Turn, type Upload } from "@fxbot/sdk/client";
import { client } from "./client.ts";
import { maxFiles, readFile } from "./attachments.ts";
import { Blob, LookPicker } from "./blob.tsx";
import { BotPanel, usePanel } from "./bot-panel.tsx";
import { AddonsPage, BotAddons } from "./addons.tsx";
import { LibraryPage } from "./library.tsx";
import { MemorySearch } from "./memory-search.tsx";
import { Version } from "./release.tsx";
import { Reply } from "./steps.tsx";
import { follow, go } from "./nav.ts";
import { ModelField, Providers } from "./providers.tsx";
import { install, keepDraft, reload, takeDraft, useInstall, useNewVersion } from "./pwa.ts";
import { useTurnStream } from "./use-turn-stream.ts";
import { leadingSkills, SkillChips, SkillMenu, useSkillPicker } from "./skill-picker.tsx";

export function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);

  // The sidebar's list. Forms bump `version` after a change; a failed load retries.
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    let stopped = false;
    const load = () =>
      client.profiles.list().then(
        (list) => {
          if (stopped) return;
          setProfiles(list);
          setOffline(false);
        },
        () => {
          if (stopped) return;
          setOffline(true);
          setTimeout(load, 3000);
        },
      );
    load();
    return () => {
      stopped = true;
    };
  }, [version]);
  // A busy bot hops in the sidebar until its turn ends, so the list is read again while any is busy.
  useEffect(() => {
    if (!profiles?.some((p) => p.busy)) return;
    const again = setTimeout(refresh, 2000);
    return () => clearTimeout(again);
  }, [profiles]);

  const [creating, setCreating] = useState(false);
  const created = (profile: Profile) => {
    setCreating(false);
    refresh();
    go(`/profiles/${profile.id}`);
  };

  const [, top, id, sub] = path.split("/");
  let screen: ReactNode;
  if (path === "/") screen = <Home profiles={profiles} offline={offline} onNew={() => setCreating(true)} />;
  else if (path === "/settings") screen = <SettingsForm />;
  else if (path === "/library") screen = <LibraryPage profiles={profiles} />;
  else if (path === "/addons") screen = <AddonsPage profiles={profiles} />;
  else if (top === "profiles" && id && sub === "edit") screen = <ProfileForm key={id} id={id} onSaved={refresh} />;
  else if (top === "profiles" && id && sub === undefined) screen = <Chat key={id} id={id} profiles={profiles} onChange={refresh} />;
  else screen = <Header title="Not found" />;

  return (
    <TooltipProvider>
      <SidebarProvider>
        <BotSidebar profiles={profiles} offline={offline} active={id} onNew={() => setCreating(true)} onChange={refresh} />
        {/* An installed app draws under the notch and the home indicator (viewport-fit=cover), so each edge pads by its
            inset. The left one belongs to the sidebar while it is open beside the page. */}
        <SidebarInset className="h-dvh overflow-hidden pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] md:peer-data-[state=expanded]:pl-0">
          {screen}
        </SidebarInset>
        <NewBot open={creating} onOpenChange={setCreating} onCreated={created} />
      </SidebarProvider>
    </TooltipProvider>
  );
}

// The create dialog: a name and a look, with the new bot watching as you choose.
function NewBot({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (profile: Profile) => void }) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">Create New Bot</DialogTitle>
        </DialogHeader>
        <form id="new-bot" onSubmit={create} className="grid max-h-[70dvh] gap-6 overflow-y-auto px-6 py-6">
          <Blob shape={shape} color={color} size={112} follow className="mx-auto" />
          <Input aria-label="Name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your Bot" className="h-12 rounded-xl text-center text-base" />
          <LookPicker shape={shape} color={color} onShape={setShape} onColor={setColor} />
          {error && <Problem>{error}</Problem>}
        </form>
        <DialogFooter className="mx-0 mb-0 px-6 py-4">
          <DialogClose asChild>
            <Button variant="outline" className="rounded-full">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="new-bot" className="rounded-full" disabled={busy || !name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BotSidebar({ profiles, offline, active, onNew, onChange }: { profiles: Profile[] | null; offline: boolean; active?: string; onNew: () => void; onChange: () => void }) {
  const { setOpenMobile } = useSidebar();
  // The open bot's eyes follow the pointer, and so do the eyes of the bot under it.
  const [hovered, setHovered] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    follow(event);
    setOpenMobile(false);
  };
  const watch = (id: string) => ({ onPointerEnter: () => setHovered(id), onPointerLeave: () => setHovered(null) });
  const blob = (profile: Profile, size: number, className = "") => (
    <Blob shape={profile.shape} color={profile.color} size={size} follow={profile.id === active || profile.id === hovered} busy={profile.busy} className={className} />
  );
  const pin = (profile: Profile, pinned: boolean) => client.profiles.update(profile.id, { pinned }).then(() => (setProblem(""), onChange()), (e: Error) => setProblem(e.message));
  // Pinned bots sit on top, large and centered; the rest are the list.
  const pinned = profiles?.filter((p) => p.pinned) ?? [];
  const full = pinned.length >= maxPinned;
  const newVersion = useNewVersion();
  return (
    <Sidebar className="bg-sidebar pl-[env(safe-area-inset-left)]">
      <SidebarHeader className="flex-row items-center justify-end pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="New bot" className="size-10 rounded-full bg-background shadow-sm" onClick={() => (onNew(), setOpenMobile(false))}>
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New bot</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <SidebarContent>
        {offline && <p className="px-4 text-sm text-destructive">{unreachable}</p>}
        {pinned.length > 0 && (
          <SidebarGroup aria-label="Pinned">
            <div className="flex justify-center gap-1">
              {pinned.map((profile) => (
                <div key={profile.id} className="group/pin relative w-24 min-w-0">
                  <a
                    href={`/profiles/${profile.id}`}
                    onClick={open}
                    {...watch(profile.id)}
                    data-active={profile.id === active || undefined}
                    className="grid justify-items-center gap-1.5 rounded-2xl px-1 pt-3 pb-2 hover:bg-sidebar-accent data-active:bg-sidebar-accent"
                  >
                    {/* Bigger than the list's 40, and three still fit across. */}
                    {blob(profile, 64)}
                    <span className="w-full truncate text-center text-sm">{profile.name}</span>
                  </a>
                  <button
                    type="button"
                    aria-label={`Unpin ${profile.name}`}
                    onClick={() => pin(profile, false)}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-background text-muted-foreground shadow-sm transition-opacity group-hover/pin:opacity-100 hover:text-foreground focus-visible:opacity-100 md:opacity-0"
                  >
                    <PinOffIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </SidebarGroup>
        )}
        {problem && <p className="px-4 text-xs text-destructive">{problem}</p>}
        <SidebarGroup>
          <SidebarMenu>
            {profiles
              ?.filter((p) => !p.pinned)
              .map((profile) => (
                <SidebarMenuItem key={profile.id}>
                  <SidebarMenuButton asChild size="lg" isActive={profile.id === active} className="h-auto gap-3 py-2 pr-9">
                    <a href={`/profiles/${profile.id}`} onClick={open} {...watch(profile.id)}>
                      {/* size-10!: the sidebar button sizes every svg in it as an icon. */}
                      {blob(profile, 40, "size-10!")}
                      <span className="grid min-w-0 gap-0.5 leading-tight">
                        <span className="truncate text-base">{profile.name}</span>
                        <span className="truncate text-muted-foreground">{profile.preview ?? "No messages yet"}</span>
                      </span>
                    </a>
                  </SidebarMenuButton>
                  <SidebarMenuAction showOnHover aria-label={`Pin ${profile.name}`} title={full ? `Up to ${maxPinned} bots can be pinned` : undefined} disabled={full} onClick={() => pin(profile, true)} className="top-1/2! -translate-y-1/2 disabled:opacity-0">
                    <PinIcon />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {/* A new build is waiting (pwa.ts). The page stays on its own build until this reloads it. */}
        {newVersion && (
          <div className="flex items-center gap-2 rounded-md bg-sidebar-accent py-1 pr-1 pl-3 text-sm">
            <span className="flex-1">New version</span>
            <Button size="sm" onClick={reload}>
              Reload
            </Button>
          </div>
        )}
        {/* One row: Settings, then the full library behind a bento button, then add-ons. */}
        <div className="flex items-center gap-1">
          <SidebarMenu className="flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={location.pathname === "/settings"}>
                <a href="/settings" onClick={open}>
                  <SettingsIcon />
                  Settings
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="/library"
                onClick={open}
                aria-label="Library"
                aria-current={location.pathname === "/library" ? "page" : undefined}
                className={buttonVariants({ variant: "ghost", size: "icon", className: "shrink-0 aria-[current=page]:bg-sidebar-accent" })}
              >
                <LayoutDashboardIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>Library</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="/addons"
                onClick={open}
                aria-label="Add-ons"
                aria-current={location.pathname === "/addons" ? "page" : undefined}
                className={buttonVariants({ variant: "ghost", size: "icon", className: "shrink-0 aria-[current=page]:bg-sidebar-accent" })}
              >
                <PuzzleIcon />
              </a>
            </TooltipTrigger>
            <TooltipContent>Add-ons</TooltipContent>
          </Tooltip>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Header({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="box-content flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
      <SidebarTrigger />
      {lead}
      <h1 className="min-w-0 flex-1 truncate font-medium">{title}</h1>
      {children}
    </header>
  );
}

const label = "grid gap-1.5 text-sm font-medium";

const Problem = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="mx-auto w-full max-w-3xl rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
    {children}
  </p>
);

function Home({ profiles, offline, onNew }: { profiles: Profile[] | null; offline: boolean; onNew: () => void }) {
  const some = Boolean(profiles?.length);
  return (
    <>
      <Header title="fxbot" />
      {offline && (
        <div className="px-4">
          <Problem>{unreachable} Retrying…</Problem>
        </div>
      )}
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageCircleDashedIcon />
          </EmptyMedia>
          <EmptyTitle>{profiles === null ? "fxbot" : some ? "Pick a bot" : "No bots yet"}</EmptyTitle>
          <EmptyDescription>{some ? "Choose one from the list, or make another." : "Make a bot to start a conversation."}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onNew}>New bot</Button>
        </EmptyContent>
      </Empty>
    </>
  );
}

function ProfileForm({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [fields, setFields] = useState<Fields>({ name: "", instructions: "", model: "", provider: "", shape: "circle", color: "brown" });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<Provider[]>([]);
  // Where the bot's chat lives now, so a move to another provider can warn first.
  const [chat, setChat] = useState<{ provider: string; sessionId: string | null }>({ provider: "", sessionId: null });
  useEffect(() => {
    client.providers.list().then(setProviders, () => {});
    client.profiles.get(id).then(
      ({ name, instructions, model, provider, shape, color, sessionId }) => {
        setFields({ name, instructions, model, provider, shape, color });
        setChat({ provider, sessionId });
        setLoaded(true);
      },
      (e: Error) => setError(e.message),
    );
  }, [id]);

  const nameOf = (provider: string) => providers.find((p) => p.id === provider)?.name ?? "another provider";
  const moving = Boolean(chat.sessionId && fields.provider !== chat.provider);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (moving && !confirm(`Moving ${fields.name} to ${nameOf(fields.provider)} starts a new chat. The current one is summarized and carried over, and ${fields.name} can search it.`)) return;
    setBusy(true);
    setError("");
    try {
      const saved = await client.profiles.update(id, fields);
      onSaved();
      go(`/profiles/${saved.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${fields.name}? Its library items stay in the library, and its conversation files stay on the server.`)) return;
    try {
      await client.profiles.remove(id);
      onSaved();
      go("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const set = (key: keyof Fields) => (event: { target: { value: string } }) => setFields({ ...fields, [key]: event.target.value });
  const providerModel = providers.find((p) => p.id === fields.provider)?.model;
  return (
    <>
      <Header title={`Edit ${fields.name || "bot"}`} />
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <form onSubmit={save} className="mx-auto grid max-w-xl gap-5">
          {loaded && (
            <div className="grid gap-5">
              <Blob shape={fields.shape} color={fields.color} size={96} follow className="mx-auto" />
              <LookPicker shape={fields.shape} color={fields.color} onShape={(shape) => setFields({ ...fields, shape })} onColor={(color) => setFields({ ...fields, color })} />
            </div>
          )}
          <label className={label}>
            Name
            <Input required maxLength={200} value={fields.name} onChange={set("name")} disabled={!loaded} />
          </label>
          <label className={label}>
            Provider
            <NativeSelect className="w-full" value={fields.provider} onChange={(e) => setFields({ ...fields, provider: e.target.value, model: "" })} disabled={!loaded}>
              {(!fields.provider || !chat.sessionId) && <NativeSelectOption value="">None</NativeSelectOption>}
              {providers.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {moving && <span className="font-normal text-muted-foreground">Moving starts a new chat that carries a summary of this one.</span>}
          </label>
          <label className={label}>
            Model
            <ModelField id="bot" provider={fields.provider} value={fields.model} onChange={(model) => setFields({ ...fields, model })} placeholder={`Default: ${providerModel || "none set in Settings"}`} />
          </label>
          <label className={label}>
            Instructions
            <Textarea rows={8} className="max-h-[50dvh]" value={fields.instructions} onChange={set("instructions")} disabled={!loaded} />
          </label>
          <BotAddons profileId={id} />
          {error && <Problem>{error}</Problem>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !loaded}>
              {busy && moving ? "Summarizing the chat…" : "Save"}
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={!loaded}>
              Delete
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}

function SettingsForm() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    client.settings.get().then(setSettings, (e: Error) => setError(e.message));
  }, []);
  const makeDefault = (defaultProvider: string) => client.settings.update({ defaultProvider }).then(setSettings, (e: Error) => setError(e.message));
  const installing = useInstall();

  return (
    <>
      <Header title="Settings" />
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto grid max-w-xl gap-5">
          {error && <Problem>{error}</Problem>}
          {installing === "prompt" && (
            <div className="flex items-center gap-3 rounded-xl border p-3 text-sm">
              <p className="flex-1">Install fxbot as an app on this device.</p>
              <Button onClick={install}>Install</Button>
            </div>
          )}
          {installing === "steps" && <p className="rounded-xl border p-3 text-sm">To install fxbot, tap Share, then Add to Home Screen, and leave Open as Web App on.</p>}
          {settings && <Providers defaultProvider={settings.defaultProvider} onDefault={makeDefault} />}
          <p className="text-sm text-muted-foreground">New bots start on the default provider, with its default model.</p>
          <MemorySearch />
          <Version />
        </div>
      </main>
    </>
  );
}

const newMessageId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

function Chat({ id, profiles, onChange }: { id: string; profiles: Profile[] | null; onChange: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  // A draft left before a new build's reload comes back (pwa.ts).
  const [draft, setDraft] = useState(() => takeDraft(id));
  useEffect(() => {
    keepDraft(id, draft);
    return () => keepDraft(id, "");
  }, [id, draft]);
  const [attached, setAttached] = useState<Upload[]>([]);
  const [notice, setNotice] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const skills = useSkillPicker(id, box, draft, setDraft);
  const skillNames = new Set(skills.skills.map((s) => s.name));
  const { turns, setTurns, connected } = useTurnStream(id, Boolean(profile?.sessionId));
  const panel = usePanel();
  // A provider switch starts a new chat. The earlier ones stay readable above the handoff, though the bot now sees only
  // their summary and its chat_history search.
  const [earlier, setEarlier] = useState<Turn[]>([]);
  const switched = Boolean(profile?.handoff);
  useEffect(() => {
    if (switched) client.profiles.earlier(id).then(setEarlier, () => {});
  }, [id, switched, profile?.sessionId]);
  // A bot with no provider cannot send: it points to Settings instead of offering the composer.
  const stuck = !profile || !profile.provider;

  // The box starts one line tall and grows with its text up to its max height, where it scrolls.
  useLayoutEffect(() => {
    if (!box.current) return;
    box.current.style.height = "auto";
    box.current.style.height = `${box.current.scrollHeight}px`;
  }, [draft]);

  // Keeps trying, so the chat comes back on its own when the server does.
  useEffect(() => {
    let stopped = false;
    const load = () =>
      client.profiles.get(id).then(
        (loaded) => {
          if (stopped) return;
          setProfile(loaded);
          setError("");
        },
        (e: Error) => {
          if (stopped) return;
          setError(e.message);
          setTimeout(load, 3000);
        },
      );
    load();
    return () => {
      stopped = true;
    };
  }, [id]);

  // The sidebar shows each bot's latest reply and whether it is busy, so the list is read again once the server has
  // taken a message, and as replies finish.
  const finished = turns.filter((turn) => turn.done).length;
  const running = turns.some((turn) => !turn.done);
  useEffect(() => {
    if (finished) onChange();
  }, [finished]); // Only the count matters; onChange is a new function on every render.

  // An unsent turn keeps its files' data, so Retry sends them again.
  async function send(text: string, messageId: string, files: Upload[]) {
    const pending = { messageId, text, files, reply: "", done: false };
    setTurns((all) => (all.some((t) => t.messageId === messageId) ? all.map((t) => (t.messageId === messageId ? pending : t)) : [...all, pending]));
    try {
      const { sessionId } = await client.send(id, { text, messageId, files: files.map(({ name, type, data }) => ({ name, type, data })) });
      setProfile((current) => current && { ...current, sessionId });
      onChange();
    } catch (e) {
      const note = `Not sent: ${(e as Error).message}`;
      setTurns((all) => all.map((t) => (t.messageId === messageId && !t.done ? { ...t, done: true, note, unsent: true } : t)));
    }
  }

  // Picked skills go first, as $name, which the server sends along with the message.
  function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    if ((!draft.trim() && !attached.length && !skills.picked.length) || stuck) return;
    send([...skills.picked.map((name) => `$${name}`), draft].filter((part) => part.trim()).join(" "), newMessageId(), attached);
    setDraft("");
    setAttached([]);
    skills.setPicked([]);
    skills.close();
    setNotice("");
  }

  // From the picker, a paste, or a drop. The list is copied first, since the browser empties it after the event.
  async function attach(files: File[]) {
    const read = await Promise.allSettled(files.map(readFile));
    const added = read.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const problems = read.flatMap((result) => (result.status === "rejected" ? [(result.reason as Error).message] : []));
    if (attached.length + added.length > maxFiles) problems.push(`A message takes at most ${maxFiles} files.`);
    setAttached((all) => [...all, ...added].slice(0, maxFiles));
    setNotice(problems.join(" "));
  }

  const offline = error || (!connected && unreachable);
  const empty = turns.length === 0 && earlier.length === 0;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The sidebar already shows which bot this is, and whether it is busy, so the name stays only for screen readers. */}
        <Header title={<span className="sr-only">{profile?.name ?? "Chat"}</span>}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Bot panel" aria-expanded={panel.open} onClick={() => panel.setOpen(!panel.open)}>
                <PanelRightIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Details and library</TooltipContent>
          </Tooltip>
        </Header>
        {offline && (
          <div className="px-4">
            <Problem>{offline} Retrying…</Problem>
          </div>
        )}
        <MessageScrollerProvider autoScroll>
          {/* The composer keeps its place in the tree, so it keeps focus when the first turn arrives. */}
          <div
            className={`flex min-h-0 flex-1 flex-col ${empty ? "justify-center gap-6 pb-[15dvh]" : ""}`}
            onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
            onDrop={(e) => {
              if (!e.dataTransfer.files.length || stuck) return;
              e.preventDefault();
              attach([...e.dataTransfer.files]);
            }}
          >
            {empty ? (
              <>
                {profile?.handoff && (
                  <div className="px-4">
                    <Handoff text={profile.handoff} />
                  </div>
                )}
                {profile && !profile.provider ? (
                  <div className="grid justify-items-center gap-3 px-4 text-center">
                    <h2 className="text-2xl font-semibold">{profile.name} has no provider</h2>
                    <p className="text-muted-foreground">Add a provider in Settings, then pick it in the bot's settings.</p>
                    <div className="flex gap-2">
                      <a href="/settings" onClick={follow} className={buttonVariants()}>
                        Settings
                      </a>
                      <a href={`/profiles/${id}/edit`} onClick={follow} className={buttonVariants({ variant: "outline" })}>
                        Edit bot
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="grid justify-items-center gap-4">
                    {profile && <Blob shape={profile.shape} color={profile.color} size={112} follow busy={running} />}
                    <h2 className="text-center text-2xl font-semibold">{profile ? `Talk to ${profile.name}` : "Loading…"}</h2>
                  </div>
                )}
              </>
            ) : (
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-4">
                    {earlier.map((turn) => (
                      <TurnView key={turn.messageId} turn={turn} color={profile?.color} skills={skillNames} />
                    ))}
                    {profile?.handoff && <Handoff text={profile.handoff} />}
                    {turns.map((turn) => (
                      <TurnView key={turn.messageId} turn={turn} color={profile?.color} skills={skillNames} retry={() => send(turn.text, turn.messageId, turn.files ?? [])} />
                    ))}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            )}
            <form onSubmit={submit} className="relative mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <SkillMenu picker={skills} />
              {notice && <p className="px-4 pb-2 text-sm text-destructive">{notice}</p>}
              {/* Wraps so the files take the first row and the text and buttons the second; the buttons stay at the bottom as the text grows. */}
              <InputGroup className="h-auto flex-wrap items-end rounded-3xl bg-background px-1">
                {(attached.length > 0 || skills.picked.length > 0) && (
                  <div className="order-first flex w-full flex-wrap gap-2 px-2 pt-2">
                    {skills.picked.length > 0 && <SkillChips names={skills.picked} remove={(name) => skills.setPicked((all) => all.filter((n) => n !== name))} />}
                    {attached.length > 0 && <Files files={attached} remove={(i) => setAttached((all) => all.toSpliced(i, 1))} />}
                  </div>
                )}
                <InputGroupAddon align="inline-start" className="pb-1.5">
                  <input ref={picker} type="file" multiple hidden onChange={(e) => attach([...(e.target.files ?? [])]).then(() => (e.target.value = ""))} />
                  <InputGroupButton size="icon-sm" className="rounded-full" disabled={stuck} aria-label="Attach files" onClick={() => picker.current?.click()}>
                    <PaperclipIcon />
                  </InputGroupButton>
                </InputGroupAddon>
                <InputGroupTextarea
                  ref={box}
                  rows={1}
                  aria-label="Message"
                  className="max-h-48 min-h-0 py-3"
                  placeholder={profile ? (stuck ? "No provider yet" : `Message ${profile.name}${skills.skills.length ? ", or $ for a skill" : ""}`) : "Loading…"}
                  value={draft}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={skills.open}
                  aria-controls="skill-picker"
                  aria-activedescendant={skills.open && skills.matches.length ? `skill-option-${skills.active}` : undefined}
                  onChange={(e) => (setDraft(e.target.value), skills.track(e.target.value, e.target.selectionStart))}
                  onFocus={() => void skills.load()}
                  onBlur={() => skills.close()}
                  onKeyDown={(e) => skills.key(e) || (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && submit(e))}
                  onPaste={(e) => {
                    if (!e.clipboardData.files.length) return;
                    // Text pasted with a picture of itself, as from a spreadsheet, keeps the text as well.
                    if (!e.clipboardData.getData("text/plain")) e.preventDefault();
                    attach([...e.clipboardData.files]);
                  }}
                  disabled={stuck}
                />
                <InputGroupAddon align="inline-end" className="pb-1.5">
                  <InputGroupButton type="submit" variant="default" size="icon-sm" className="rounded-full" disabled={stuck || (!draft.trim() && !attached.length && !skills.picked.length)} aria-label="Send">
                    <ArrowUpIcon />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </MessageScrollerProvider>
      </div>
      {profile && <BotPanel profile={profile} profiles={profiles} panel={panel} version={finished} />}
    </div>
  );
}

// One turn: the person's message as the scroll anchor, then the reply as markdown with its actions.
// WCAG relative luminance of a #rrggbb color.
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// Text on a bot's color: white or near-black, whichever contrasts more.
function ink(color: Color) {
  const [light, dark] = [luminance(colors[color]), luminance("#1f1f1f")];
  return 1.05 / (light + 0.05) >= (light + 0.05) / (dark + 0.05) ? "#ffffff" : "#1f1f1f";
}

// Messages to the bot are drawn in the bot's own color. Skills the message starts with show as chips.
function TurnView({ turn, color, skills, retry }: { turn: Turn; color?: Color; skills: Set<string>; retry?: () => void }) {
  const named = leadingSkills(turn.text, skills);
  return (
    <>
      {turn.text || turn.files?.length ? (
        <MessageScrollerItem messageId={`${turn.messageId}-user`} scrollAnchor>
          <Message align="end">
            <MessageContent>
              {turn.from && <p className="text-right text-xs text-muted-foreground">From {turn.from}</p>}
              {named.skills.length ? <SkillChips className="flex-wrap justify-end" names={named.skills} /> : null}
              {turn.files?.length ? <Files className="flex-wrap justify-end" files={turn.files} /> : null}
              {named.rest && (
                <Bubble align="end" variant="muted">
                  <BubbleContent className="whitespace-pre-wrap" style={color && { background: colors[color], color: ink(color) }}>
                    {named.rest}
                  </BubbleContent>
                </Bubble>
              )}
            </MessageContent>
          </Message>
        </MessageScrollerItem>
      ) : null}
      <MessageScrollerItem messageId={`${turn.messageId}-reply`}>
        <Message>
          <MessageContent>
            <Reply turn={turn} />
            {turn.note && (
              <p className="text-sm text-destructive">
                {turn.note}{" "}
                {turn.unsent && retry && (
                  <Button size="xs" variant="outline" onClick={retry}>
                    Retry
                  </Button>
                )}
              </p>
            )}
            {turn.done && turn.reply && (
              <MessageFooter>
                <CopyButton text={turn.reply} />
              </MessageFooter>
            )}
          </MessageContent>
        </Message>
      </MessageScrollerItem>
    </>
  );
}

// Files in the composer, as shadcn's Attachment chips with a remove button, or on a sent message, where images come
// first, at a readable size, and open larger in a dialog, and a text file opens its library file.
function Files({ files, remove, className = "" }: { files: Upload[]; remove?: (index: number) => void; className?: string }) {
  const image = (file: Upload) => Boolean(file.url) && file.type.startsWith("image/");
  const shown = remove ? files : [...files.filter(image), ...files.filter((file) => !image(file))];
  return (
    <AttachmentGroup className={className}>
      {shown.map((file, i) =>
        !remove && image(file) ? (
          <Dialog key={i}>
            <DialogTrigger className="flex-none cursor-zoom-in" aria-label={`Open ${file.name}`}>
              <img src={file.url} alt={file.name} className="max-h-48 max-w-48 rounded-xl border object-cover" />
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="w-fit p-2 pt-11 sm:max-w-[calc(100%-4rem)]">
              <DialogTitle className="absolute top-4 right-12 left-3 truncate text-sm">{file.name}</DialogTitle>
              <img src={file.url} alt={file.name} className="max-h-[calc(100dvh-8rem)] max-w-[calc(100vw-3rem)] rounded-lg" />
            </DialogContent>
          </Dialog>
        ) : (
          <Attachment key={i} size="sm">
            {!remove && file.url && (
              <AttachmentTrigger asChild>
                <a href={file.url} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`} />
              </AttachmentTrigger>
            )}
            <AttachmentMedia variant={image(file) ? "image" : "icon"}>{image(file) ? <img src={file.url} alt="" /> : <FileTextIcon />}</AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{file.name}</AttachmentTitle>
            </AttachmentContent>
            {remove && (
              <AttachmentActions>
                <AttachmentAction type="button" aria-label={`Remove ${file.name}`} onClick={() => remove(i)}>
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            )}
          </Attachment>
        ),
      )}
    </AttachmentGroup>
  );
}

// The summary a provider switch carried over, folded at the top of the chat it started.
function Handoff({ text }: { text: string }) {
  const [first, ...summary] = text.split("\n\n");
  const from = /moved from (.+) to .+:$/.exec(first)?.[1];
  return (
    <Collapsible className="mx-auto w-full max-w-3xl rounded-xl border px-3 py-2 text-sm">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 font-medium">
        <ChevronRightIcon className="size-4 transition-transform group-data-[state=open]:rotate-90" />
        Continued from {from ?? "an earlier chat"}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 whitespace-pre-wrap text-muted-foreground">{summary.join("\n\n")}</CollapsibleContent>
    </Collapsible>
  );
}


function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Copy" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Copy</TooltipContent>
    </Tooltip>
  );
}
