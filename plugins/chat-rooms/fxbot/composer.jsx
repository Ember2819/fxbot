// The room's message box. It's ProseMirror, so a bot you tag is a chip with its avatar, which deletes as one piece. `@`
// at the start of a line or after a space lists the room's bots, then Everyone, filtered by what follows, and the pick
// replaces what was typed. Enter sends, and Shift+Enter starts a new line. Sending writes each chip as its token.
import { useEffect, useRef, useState } from "react";
import * as app from "@fxbot/app";
import { baseKeymap, splitBlock } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Chip, Stack } from "./faces.jsx";
import { all, tokenOf, tokens } from "./mentions.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
    text: { group: "inline" },
    mention: {
      attrs: { bot: {} },
      group: "inline",
      inline: true,
      atom: true,
      selectable: false,
      parseDOM: [{ tag: "span[data-bot]", getAttrs: (dom) => ({ bot: dom.getAttribute("data-bot") }) }],
      toDOM: (node) => ["span", { "data-bot": node.attrs.bot }],
    },
  },
});

// The box's text, each chip as its token.
function textOf(doc) {
  const lines = [];
  doc.forEach((paragraph) => {
    let line = "";
    paragraph.forEach((node) => (line += node.type.name === "mention" ? (node.attrs.bot === "all" ? all : tokenOf(node.attrs.bot)) : (node.text ?? "")));
    lines.push(line);
  });
  return lines.join("\n").trim();
}
// A text back in the box, its tokens as chips, after a send that failed.
function docOf(text) {
  const paragraph = (line) => {
    const parts = [];
    let at = 0;
    for (const m of line.matchAll(tokens)) {
      if (m.index > at) parts.push(schema.text(line.slice(at, m.index)));
      parts.push(schema.nodes.mention.create({ bot: m[1] ?? "all" }));
      at = m.index + m[0].length;
    }
    if (at < line.length) parts.push(schema.text(line.slice(at)));
    return schema.node("paragraph", null, parts);
  };
  return schema.node("doc", null, text.split("\n").map(paragraph));
}
const fresh = (doc) => EditorState.create({ schema, doc, plugins: [history(), keymap({ "Mod-z": undo, "Shift-Mod-z": redo, "Mod-y": redo, "Shift-Enter": splitBlock }), keymap(baseKeymap)] });

// The @ being typed before the caret, and what follows it: at the start of a line or after a space.
function typing(state) {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, null, "￼");
  const m = /(?:^|\s)@([^@\n￼]{0,30})$/.exec(before);
  return m ? { from: $from.pos - m[1].length - 1, to: $from.pos, query: m[1] } : null;
}
// What matches what follows @: names that start with it, then names that hold it. Everyone comes last.
function rank(choices, query) {
  const q = query.toLowerCase();
  const score = (c) => (!q || c.name.toLowerCase().startsWith(q) ? 0 : c.name.toLowerCase().includes(q) ? 1 : 9);
  return choices
    .map((c, i) => [score(c), i, c])
    .filter(([n]) => n < 9)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, , c]) => c);
}

// `submitRef` gets the box's send, for a Send button, and `onEmpty` hears whether it's empty.
export function Composer({ bots, placeholder, disabled, onSend, submitRef, onEmpty }) {
  const box = useRef(null);
  const view = useRef(null);
  // The room's bots, then Everyone, for the list.
  const choices = useRef([]);
  choices.current = [...bots.map((bot) => ({ id: bot.id, name: bot.name, bot })), ...(bots.length > 1 ? [{ id: "all", name: "Everyone" }] : [])];
  const send = useRef(onSend);
  send.current = onSend;
  // Each chip's DOM node in the box, and its bot, for its avatar, drawn with createPortal where the app has it.
  const [chips, setChips] = useState(() => new Map());
  const [list, setList] = useState(null);
  const shown = useRef(null);
  shown.current = list;
  // The @ whose list Escape closed, so it stays shut until another is typed.
  const dismissed = useRef(-1);
  const [empty, setEmpty] = useState(true);
  const [said, setSaid] = useState("");
  const told = useRef(onEmpty);
  told.current = onEmpty;
  useEffect(() => told.current?.(empty), [empty]);

  function refresh(state) {
    const first = state.doc.firstChild;
    setEmpty(state.doc.childCount === 1 && first.childCount === 0);
    const at = typing(state);
    if (!at || at.from !== dismissed.current) dismissed.current = -1;
    const matches = at && at.from !== dismissed.current ? rank(choices.current, at.query) : [];
    const next = matches.length ? { ...at, matches, active: shown.current && shown.current.from === at.from && shown.current.query === at.query ? shown.current.active : 0 } : null;
    if (next && (!shown.current || shown.current.matches.length !== matches.length)) setSaid(`${matches.length} ${matches.length === 1 ? "match" : "matches"}`);
    setList(next);
  }

  function pick(choice) {
    const v = view.current;
    const at = shown.current;
    if (!v || !at) return;
    const tr = v.state.tr.replaceWith(at.from, at.to, [schema.nodes.mention.create({ bot: choice.id }), schema.text(" ")]);
    v.dispatch(tr.setSelection(TextSelection.create(tr.doc, at.from + 2)));
    v.focus();
    setSaid(`Mentioned ${choice.id === "all" ? "everyone" : choice.name}`);
  }

  function submit() {
    const v = view.current;
    const text = textOf(v.state.doc);
    if (!text) return;
    v.updateState(fresh());
    refresh(v.state);
    Promise.resolve(send.current(text)).catch(() => {
      v.updateState(fresh(docOf(text)));
      refresh(v.state);
    });
  }

  if (submitRef) submitRef.current = submit;

  function key(event) {
    if (event.isComposing || event.keyCode === 229) return false;
    const at = shown.current;
    if (at) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const by = event.key === "ArrowDown" ? 1 : -1;
        setList({ ...at, active: (at.active + by + at.matches.length) % at.matches.length });
        return true;
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
        pick(at.matches[at.active]);
        return true;
      }
      if (event.key === "Escape") {
        dismissed.current = at.from;
        setList(null);
        return true;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      submit();
      return true;
    }
    return false;
  }

  useEffect(() => {
    const nameOf = (id) => (id === "all" ? "everyone" : (choices.current.find((c) => c.id === id)?.name ?? "a bot that's gone"));
    const chip = (node) => {
      const dom = document.createElement("span");
      dom.dataset.bot = node.attrs.bot;
      dom.contentEditable = "false";
      if (app.createPortal) setChips((now) => new Map(now).set(dom, node.attrs.bot));
      else (dom.className = "cr-chip"), (dom.textContent = `@${nameOf(node.attrs.bot)}`);
      return {
        dom,
        ignoreMutation: () => true,
        destroy: () =>
          app.createPortal &&
          setChips((now) => {
            const next = new Map(now);
            next.delete(dom);
            return next;
          }),
      };
    };
    const v = new EditorView(box.current, {
      state: fresh(),
      nodeViews: { mention: chip },
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": "Message the room", "aria-autocomplete": "list", class: "cr-editor" },
      handleKeyDown: (_view, event) => key(event),
      dispatchTransaction(tr) {
        v.updateState(v.state.apply(tr));
        refresh(v.state);
      },
    });
    view.current = v;
    return () => v.destroy();
  }, []);

  useEffect(() => void view.current?.setProps({ editable: () => !disabled }), [disabled]);
  // The list, for assistive technology: the box controls it, and its active option is the box's.
  useEffect(() => {
    const dom = view.current?.dom;
    if (!dom) return;
    if (list) dom.setAttribute("aria-controls", "cr-mentions"), dom.setAttribute("aria-activedescendant", `cr-mention-${list.active}`);
    else dom.removeAttribute("aria-controls"), dom.removeAttribute("aria-activedescendant");
  }, [list]);

  return (
    <div className="cr-box">
      {list && (
        <div id="cr-mentions" role="listbox" aria-label="Bots" className="absolute right-0 bottom-full left-0 z-10 mb-2 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md">
          {list.matches.map((choice, i) => (
            <button
              key={choice.id}
              id={`cr-mention-${i}`}
              type="button"
              role="option"
              aria-selected={i === list.active}
              // Keeps the box focused, so the pick lands where the caret was.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(choice)}
              className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${i === list.active ? "bg-accent text-accent-foreground" : ""}`}
            >
              {choice.bot ? <app.ui.Blob shape={choice.bot.shape} color={choice.bot.color} size={24} /> : <Stack ids={bots.map((bot) => bot.id)} size={16} />}
              <span className="min-w-0 flex-1 truncate font-medium">{choice.name}</span>
            </button>
          ))}
        </div>
      )}
      <div ref={box} />
      {empty && (
        <span className="cr-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      )}
      <div aria-live="polite" className="sr-only">
        {said}
      </div>
      {app.createPortal && [...chips].map(([dom, id]) => app.createPortal(<Chip id={id} />, dom, `${id}-${[...chips.keys()].indexOf(dom)}`))}
    </div>
  );
}
