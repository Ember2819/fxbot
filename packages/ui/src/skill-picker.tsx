import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { BookOpenIcon, XIcon } from "lucide-react";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import type { BotSkill } from "@fxbot/sdk/client";
import { client } from "./client.ts";

type Token = { trigger: "$" | "/"; start: number; query: string };

// A bot's skills that match what follows $ or /: by the start of the name, then anywhere in it, then its letters in
// order (fxcommit finds fx-commit), then its description.
function rank(skills: BotSkill[], query: string) {
  const q = query.toLowerCase();
  const inOrder = (name: string) => [...name].reduce((i, c) => (c === q[i] ? i + 1 : i), 0) === q.length;
  const score = (s: BotSkill) => (!q || s.name.startsWith(q) ? 0 : s.name.includes(q) ? 1 : inOrder(s.name) ? 2 : s.description.toLowerCase().includes(q) ? 3 : 9);
  return skills
    .map((s) => [score(s), s] as const)
    .filter(([n]) => n < 9)
    .sort((a, b) => a[0] - b[0])
    .map(([, s]) => s)
    .slice(0, 8);
}

// The skills a chat's message box offers: typing $ anywhere, or / at the start, lists the bot's skills, and the one
// picked becomes a chip. Sending puts each chip first as $name, which the server sends along with the message.
export function useSkillPicker(id: string, box: RefObject<HTMLTextAreaElement | null>, draft: string, setDraft: (text: string) => void) {
  const [skills, setSkills] = useState<BotSkill[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [token, setToken] = useState<Token | null>(null);
  const [active, setActive] = useState(0);
  // Where the caret goes once a pick has rendered, before the next key lands.
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null || !box.current) return;
    box.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [draft, picked]);
  // Read when the chat opens, and again when the box gets focus, so skills added since show up.
  const load = () => client.profiles.skills(id).then(setSkills, () => {});
  useEffect(() => void (setPicked([]), load()), [id]);
  const matches = token ? rank(skills, token.query) : [];
  // A $ that matches no skill is likely money, so the list stays shut; a / at the start says what there is.
  const open = Boolean(token) && (matches.length > 0 || token?.trigger === "/");

  // The token being typed before the caret: $name after a space or at the start, or /name at the start.
  function track(value: string, caret: number) {
    const before = value.slice(0, caret);
    const dollar = /(?:^|\s)\$([\w.-]*)$/.exec(before);
    const slash = /^\/([\w.-]*)$/.exec(before);
    setToken(dollar ? { trigger: "$", start: before.length - dollar[1].length - 1, query: dollar[1] } : slash ? { trigger: "/", start: 0, query: slash[1] } : null);
    setActive(0);
  }

  function choose(name: string) {
    if (!token) return;
    const next = draft.slice(0, token.start) + draft.slice(token.start + 1 + token.query.length).replace(/^ /, "");
    setDraft(next);
    setPicked((all) => (all.includes(name) ? all : [...all, name]));
    setToken(null);
    caret.current = token.start;
  }

  // Keys while the list is open: arrows move, Enter or Tab picks, Escape closes. True when the key was the list's.
  function key(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % Math.max(matches.length, 1));
      return true;
    }
    if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey && matches.length) {
      e.preventDefault();
      choose(matches[active].name);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setToken(null);
      return true;
    }
    return false;
  }

  return { skills, picked, setPicked, token, open, matches, active, track, choose, key, load, close: () => setToken(null) };
}

export type SkillPicker = ReturnType<typeof useSkillPicker>;

// The list above the message box, for the textarea's aria-controls.
export function SkillMenu({ picker }: { picker: SkillPicker }) {
  if (!picker.open) return null;
  return (
    <div id="skill-picker" role="listbox" aria-label="Skills" className="absolute right-4 bottom-full left-4 z-10 mb-2 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md">
      {picker.matches.map((skill, i) => (
        <button
          key={skill.name}
          id={`skill-option-${i}`}
          type="button"
          role="option"
          aria-selected={i === picker.active}
          // Keeps the box focused, so the pick lands where the caret was.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => picker.choose(skill.name)}
          className={`flex w-full min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${i === picker.active ? "bg-accent text-accent-foreground" : ""}`}
        >
          <BookOpenIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="grid min-w-0 flex-1">
            <span className="font-medium">{skill.name}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">{skill.description}</span>
          </span>
        </button>
      ))}
      {!picker.matches.length && (
        <p className="px-2.5 py-2 text-sm text-muted-foreground">{picker.skills.length ? "No skill matches." : "This bot has no skills yet. Add them in Plugins."}</p>
      )}
    </div>
  );
}

// Skills as chips: in the message box with a remove button, or on a sent message.
export function SkillChips({ names, remove, className = "" }: { names: string[]; remove?: (name: string) => void; className?: string }) {
  return (
    <AttachmentGroup className={className}>
      {names.map((name) => (
        <Attachment key={name} size="sm">
          <AttachmentMedia variant="icon">
            <BookOpenIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{name}</AttachmentTitle>
          </AttachmentContent>
          {remove && (
            <AttachmentActions>
              <AttachmentAction type="button" aria-label={`Remove ${name}`} onClick={() => remove(name)}>
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          )}
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

// The skills a sent message starts with, as $name, or one /name, and the rest of its text.
export function leadingSkills(text: string, names: Set<string>) {
  const found: string[] = [];
  let rest = text;
  for (let m; (m = /^\s*([$/])([\w./-]+)(?=\s|$)/.exec(rest)) && names.has(m[2]) && (m[1] === "$" || !found.length); rest = rest.slice(m[0].length)) found.push(m[2]);
  return { skills: found, rest: found.length ? rest.replace(/^\s+/, "") : text };
}
