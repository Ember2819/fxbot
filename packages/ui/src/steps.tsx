import { Fragment, useState, type ComponentType, type ReactNode } from "react";
import { BookOpenIcon, BrainIcon, CircleAlertIcon, CircleCheckIcon, EraserIcon, FileTextIcon, HistoryIcon, LibraryIcon, LoaderCircleIcon, SaveIcon, SearchIcon, WrenchIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace";
import type { Part, Turn } from "@fxbot/sdk/client";
import { Fold } from "./fold.tsx";
import { PluginPart, useFold, usePluginToolView } from "./plugins.tsx";

type Tool = Extract<Part, { type: "tool" }>;
type Step = Extract<Part, { type: "reasoning" | "tool" }>;
type Input = Record<string, unknown> | undefined;

// A tool result shows this much; the bot saw all of it.
const shownChars = 4000;

type Joined = Extract<Part, { type: "user" }>;

// A reply as it happened, after shadcn's Trace patterns: each run of steps, thinking and tool calls, is one list, and
// the reply's text sits between runs. Two or more steps in a run fold under one summary, open while the bot works. Messages
// that joined the turn sit where they did, each run of them drawn by `said`.
export function Reply({ turn, said }: { turn: Turn; said?: (messages: Joined[]) => ReactNode }) {
  const parts = turn.parts ?? [];
  // A turn from an earlier chat has only its text.
  if (!parts.length) return turn.reply ? <Streamdown>{turn.reply}</Streamdown> : turn.done ? null : <p className="animate-pulse text-muted-foreground">Thinking…</p>;
  const blocks: (string | Step[] | { joined: Joined[] })[] = [];
  for (const part of parts) {
    const last = blocks.at(-1);
    if (part.type === "text") blocks.push(part.text);
    else if (part.type === "user") {
      if (last && typeof last === "object" && "joined" in last) last.joined.push(part);
      else blocks.push({ joined: [part] });
    }
    else if (Array.isArray(last)) last.push(part);
    else blocks.push([part]);
  }
  return blocks.map((block, i) =>
    typeof block === "string" ? (
      <Streamdown key={i}>{block}</Streamdown>
    ) : Array.isArray(block) ? (
      <Steps key={i} steps={block} working={!turn.done && i === blocks.length - 1} />
    ) : (
      <Fragment key={i}>{said?.(block.joined) ?? block.joined.map((message, j) => <p key={j} className="text-muted-foreground">{message.text}</p>)}</Fragment>
    ),
  );
}

function Steps({ steps: all, working }: { steps: Step[]; working: boolean }) {
  const [open, setOpen] = useState<boolean>();
  const fold = useFold();
  // A call a plugin folds is in a pill, not among the steps.
  const sends = all.filter((s): s is Tool => s.type === "tool" && Boolean(fold.tool(s)));
  const steps = all.filter((s) => !sends.includes(s as Tool));
  const pill = sends.length > 0 && (
    <Fold items={sends.map((call) => ({ sent: true, ...fold.tool(call) }))} busy={sends.some((call) => !call.done)}>
      {sends.map((call) => (
        <ToolCard key={call.id} call={call} />
      ))}
    </Fold>
  );
  const rows = steps.map((step, i) =>
    step.type === "reasoning" ? <Thinking key={i} text={step.text} running={working && i === steps.length - 1} /> : <ToolCall key={step.id} call={step} />,
  );
  const tools = steps.filter((s): s is Tool => s.type === "tool");
  const cards = tools.map((call) => <ToolCard key={call.id} call={call} />);
  if (!steps.length) return pill;
  if (steps.length === 1)
    return (
      <>
        <Trace>{rows}</Trace>
        {cards}
        {pill}
      </>
    );
  const failed = tools.filter(failedCall).length;
  const thought = steps.some((s) => s.type === "reasoning");
  const title = working ? "Working" : !tools.length ? "Thought" : `${thought ? "Thought and used" : "Used"} ${tools.length} tool${tools.length === 1 ? "" : "s"}`;
  return (
    <>
      <Trace>
        <TraceCollapsible open={open ?? working} onOpenChange={setOpen}>
          <TraceCollapsibleTrigger>
            <TraceLine status={working ? "running" : failed ? "error" : undefined}>
              <TraceIcon>{working ? <LoaderCircleIcon className="animate-spin" /> : failed ? <CircleAlertIcon /> : <CircleCheckIcon />}</TraceIcon>
              <TraceTitle>{title}</TraceTitle>
              <TraceDescription>{failed ? `${failed} failed` : `${steps.length} steps`}</TraceDescription>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>
            <Trace>{rows}</Trace>
          </TraceCollapsibleContent>
        </TraceCollapsible>
      </Trace>
      {cards}
      {pill}
    </>
  );
}

// A plugin's card for a call the owner should see, such as a routine just made. It stays out of the folds.
function ToolCard({ call }: { call: Tool }) {
  const view = usePluginToolView(call.name);
  if (!view?.open) return null;
  return (
    <PluginPart plugin={view.plugin}>
      <view.View call={call} />
    </PluginPart>
  );
}

// Open while the model thinks, folded once it moves on. A click either way wins.
function Thinking({ text, running }: { text: string; running: boolean }) {
  const [open, setOpen] = useState<boolean>();
  return (
    <TraceCollapsible open={open ?? running} onOpenChange={setOpen}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>{running ? <LoaderCircleIcon className="animate-spin" /> : <CircleCheckIcon />}</TraceIcon>
          <TraceTitle>{running ? "Thinking" : "Thought"}</TraceTitle>
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">{text}</TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

// fxbot's own tools read as sentences. Any other, such as an MCP server's, goes by its name.
const builtIn: Record<string, { icon: ComponentType; doing: string; done: string; failed: string; gist?: (input: Input) => unknown }> = {
  chat_history: { icon: HistoryIcon, doing: "Searching earlier chats", done: "Searched earlier chats", failed: "Couldn't search earlier chats", gist: (i) => i?.query ?? i?.around },
  library_search: { icon: LibraryIcon, doing: "Searching the library", done: "Searched the library", failed: "Couldn't search the library", gist: (i) => i?.query },
  library_read: { icon: FileTextIcon, doing: "Reading from the library", done: "Read from the library", failed: "Couldn't read from the library", gist: (i) => i?.id },
  library_save: { icon: SaveIcon, doing: "Saving to the library", done: "Saved to the library", failed: "Couldn't save to the library", gist: (i) => i?.name },
  memory_save: { icon: BrainIcon, doing: "Saving a memory", done: "Saved a memory", failed: "Couldn't save a memory", gist: (i) => i?.text },
  memory_search: { icon: SearchIcon, doing: "Searching memories", done: "Searched memories", failed: "Couldn't search memories", gist: (i) => i?.query },
  memory_forget: { icon: EraserIcon, doing: "Forgetting a memory", done: "Forgot a memory", failed: "Couldn't forget a memory", gist: (i) => i?.id },
  skill: { icon: BookOpenIcon, doing: "Reading a skill", done: "Read a skill", failed: "Couldn't read a skill", gist: (i) => (i?.name ? [i.name, i.file].filter(Boolean).join(" / ") : i?.search) },
};

// A call failed when its tool said so, or when the turn ended before it did.
const failedCall = (call: Tool) => call.error === true || (call.done && call.output === undefined);
// The first short text in the input says what the call was about.
const firstText = (input: Input) => Object.values(input ?? {}).find((v): v is string => typeof v === "string" && v.trim() !== "");

function ToolCall({ call }: { call: Tool }) {
  const input = call.input && typeof call.input === "object" ? (call.input as Input) : undefined;
  const known = builtIn[call.name];
  const failed = failedCall(call);
  const Icon = !call.done ? LoaderCircleIcon : failed ? CircleAlertIcon : (known?.icon ?? WrenchIcon);
  const name = <code className="font-mono text-[0.85em]">{call.name}</code>;
  const title = known ? (!call.done ? known.doing : failed ? known.failed : known.done) : !call.done ? <>Running {name}</> : failed ? <>{name} failed</> : <>Ran {name}</>;
  const gist = String((known?.gist ? known.gist(input) : firstText(input)) ?? "");
  const shown = call.output !== undefined && call.output.length > shownChars ? `${call.output.slice(0, shownChars)}…` : call.output;
  // A plugin's tool can show its call its own way.
  const view = usePluginToolView(call.name);
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>
        <TraceLine status={!call.done ? "running" : failed ? "error" : undefined}>
          <TraceIcon>
            <Icon className={call.done ? undefined : "animate-spin"} />
          </TraceIcon>
          <TraceTitle>{title}</TraceTitle>
          {gist && <TraceDescription className="max-w-48 truncate sm:max-w-80">{gist}</TraceDescription>}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="grid gap-2">
        {view && !view.open ? (
          <PluginPart plugin={view.plugin}>
            <view.View call={call} />
          </PluginPart>
        ) : (
          <>
            <Output label="Input" text={call.inputPreview ? `${call.inputPreview}…` : JSON.stringify(call.input ?? {}, null, 2)} />
            {shown !== undefined && <Output label={call.error ? "Error" : "Result"} text={shown} error={call.error} />}
          </>
        )}
        {call.done && call.output === undefined && <p className="text-sm text-destructive">The reply ended before this tool did.</p>}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

// Tool input and output are shown as plain text: a result can come from anywhere, so nothing in it runs or renders.
function Output({ label, text, error }: { label: string; text: string; error?: boolean }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <pre className={`max-h-64 overflow-auto rounded-md border p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words ${error ? "border-destructive/30 bg-destructive/5 text-destructive" : "bg-muted/50"}`}>{text}</pre>
    </div>
  );
}
