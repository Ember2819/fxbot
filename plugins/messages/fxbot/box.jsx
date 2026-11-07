// The message box in a bot's chat, in the place of the app's textarea. It's ProseMirror, as a room's box is, so a bot you
// tag is a chip with its face, which deletes as one piece. `@` at the start of a line or after a space lists the bots
// this one can reach, filtered by what follows, and the pick replaces what was typed. To the app it acts as a textarea:
// `value` is the text, with each chip as a link that holds the bot's id, so two Bobs can't be confused, and the rest of
// its props are a textarea's. The link reads as a name to a bot, and in any Markdown, with or without this plugin.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, createPortal, ui, useBots } from "@fxbot/app";
import { baseKeymap, splitBlock } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model";
import { EditorState, Selection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

export const tagLink = /\[@([^\]\n]*)\]\(\/profiles\/([0-9a-f]{12})\)/g;

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
    text: { group: "inline" },
    tag: {
      attrs: { bot: {}, name: {} },
      group: "inline",
      inline: true,
      atom: true,
      selectable: false,
      parseDOM: [{ tag: "span[data-bot]", getAttrs: (dom) => ({ bot: dom.getAttribute("data-bot"), name: dom.getAttribute("data-name") }) }],
      toDOM: (node) => ["span", { "data-bot": node.attrs.bot, "data-name": node.attrs.name }],
    },
  },
});

// The box's text, each chip as its link. A line is a paragraph.
function textOf(doc) {
  const lines = [];
  doc.forEach((paragraph) => {
    let line = "";
    paragraph.forEach((node) => (line += node.type.name === "tag" ? `[@${node.attrs.name}](/profiles/${node.attrs.bot})` : (node.text ?? "")));
    lines.push(line);
  });
  return lines.join("\n");
}
// A text in the box, its links as chips.
function docOf(text) {
  const paragraph = (line) => {
    const parts = [];
    let at = 0;
    for (const m of line.matchAll(tagLink)) {
      if (m.index > at) parts.push(schema.text(line.slice(at, m.index)));
      parts.push(schema.nodes.tag.create({ bot: m[2], name: m[1] }));
      at = m.index + m[0].length;
    }
    if (at < line.length) parts.push(schema.text(line.slice(at)));
    return schema.node("paragraph", null, parts);
  };
  return schema.node("doc", null, text.split("\n").map(paragraph));
}
const stateOf = (text) => {
  const doc = docOf(text);
  return EditorState.create({ schema, doc, selection: Selection.atEnd(doc), plugins: [history(), keymap({ "Mod-z": undo, "Shift-Mod-z": redo, "Mod-y": redo, "Shift-Enter": splitBlock }), keymap(baseKeymap)] });
};

// Where the caret is, as a textarea counts it, and back: the app's skills list works in offsets into the text.
const offsetOf = (doc, pos) => textOf(doc.cut(0, pos)).length;
function posOf(doc, offset) {
  let left = offset;
  let start = 1;
  for (let i = 0; i < doc.childCount; i++) {
    const paragraph = doc.child(i);
    const size = textOf(schema.node("doc", null, [paragraph])).length;
    if (left <= size) {
      let at = start;
      for (let j = 0; j < paragraph.childCount && left > 0; j++) {
        const node = paragraph.child(j);
        const length = node.isText ? node.text.length : textOf(schema.node("doc", null, [schema.node("paragraph", null, [node])])).length;
        if (node.isText && left <= length) return at + left;
        // Inside a chip's link, the caret goes after it.
        left -= Math.min(left, length);
        at += node.nodeSize;
      }
      return at;
    }
    left -= size + 1;
    start += paragraph.nodeSize;
  }
  return Selection.atEnd(doc).from;
}

// The @ being typed before the caret, and what follows it.
function typing(state) {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, null, "￼");
  const m = /(?:^|\s)@([^@\n￼]{0,30})$/.exec(before);
  return m ? { from: $from.pos - m[1].length - 1, to: $from.pos, query: m[1] } : null;
}
// What matches what follows @: names that start with it, then names that hold it.
function rank(choices, query) {
  const q = query.toLowerCase();
  const score = (c) => (!q || c.name.toLowerCase().startsWith(q) ? 0 : c.name.toLowerCase().includes(q) ? 1 : 9);
  return choices
    .map((c, i) => [score(c), i, c])
    .filter(([n]) => n < 9)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, 8)
    .map(([, , c]) => c);
}

// A chip: the bot's face and its name now, or the name it had, if it's gone.
function Chip({ id, name }) {
  const bot = (useBots() ?? []).find((b) => b.id === id);
  return (
    <span className="fm-chip">
      {bot && (
        <span className="fm-chip-face" aria-hidden="true">
          <ui.Blob {...bot} size={16} />
        </span>
      )}
      @{bot?.name ?? name}
    </span>
  );
}

export function Box({ bot, value, onChange, onKeyDown, onPaste, onFocus, onBlur, placeholder, disabled, className, ref, rows: _rows, ...aria }) {
  const mount = useRef(null);
  const view = useRef(null);
  const bots = useBots() ?? [];
  // Who this bot can reach, with each one's line.
  const [reach, setReach] = useState(() => new Map());
  const choices = useRef([]);
  choices.current = bots.filter((b) => reach.has(b.id)).map((b) => ({ ...b, about: reach.get(b.id) }));
  const load = () => {
    if (bot?.id) void api(`/tags/${bot.id}`).then((res) => (res.ok ? res.json() : [])).then((list) => setReach(new Map(list.map((one) => [one.id, one.about]))), () => {});
  };
  useEffect(load, [bot?.id]);
  // The app's handlers as they are now, for the editor, which is made once.
  const latest = useRef({});
  latest.current = { onChange, onKeyDown, onPaste, onFocus, onBlur, load };
  // Each chip's DOM node in the box, and its bot, drawn with createPortal where the app has it.
  const [chips, setChips] = useState(() => new Map());
  const [list, setList] = useState(null);
  const shown = useRef(null);
  shown.current = list;
  // The @ whose list Escape closed, so it stays shut until another is typed.
  const dismissed = useRef(-1);
  const [empty, setEmpty] = useState(!value);
  const [said, setSaid] = useState("");

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
    const tr = v.state.tr.replaceWith(at.from, at.to, [schema.nodes.tag.create({ bot: choice.id, name: choice.name.replace(/[[\]\n]/g, "") }), schema.text(" ")]);
    v.dispatch(tr.setSelection(TextSelection.create(tr.doc, at.from + 2)));
    v.focus();
    setSaid(`Tagged ${choice.name}`);
  }

  // The list's keys come first, then the app's: it stops the event to say it took one.
  function key(event) {
    if (event.isComposing || event.keyCode === 229) return false;
    const at = shown.current;
    if (at) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setList({ ...at, active: (at.active + (event.key === "ArrowDown" ? 1 : -1) + at.matches.length) % at.matches.length });
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
    event.nativeEvent = event;
    latest.current.onKeyDown?.(event);
    return event.defaultPrevented;
  }

  useLayoutEffect(() => {
    const chip = (node) => {
      const dom = document.createElement("span");
      dom.dataset.bot = node.attrs.bot;
      dom.contentEditable = "false";
      setChips((now) => new Map(now).set(dom, { id: node.attrs.bot, name: node.attrs.name }));
      return {
        dom,
        ignoreMutation: () => true,
        destroy: () =>
          setChips((now) => {
            const next = new Map(now);
            next.delete(dom);
            return next;
          }),
      };
    };
    const v = new EditorView(mount.current, {
      state: stateOf(value ?? ""),
      nodeViews: { tag: chip },
      handleKeyDown: (_view, event) => key(event),
      handlePaste(_view, event) {
        latest.current.onPaste?.(event);
        return event.defaultPrevented;
      },
      handleDOMEvents: {
        focus: (_view, event) => (latest.current.load(), latest.current.onFocus?.(event), false),
        blur: (_view, event) => (setList(null), latest.current.onBlur?.(event), false),
      },
      dispatchTransaction(tr) {
        v.updateState(v.state.apply(tr));
        refresh(v.state);
        if (tr.docChanged) latest.current.onChange?.({ target: { value: textOf(v.state.doc), selectionStart: offsetOf(v.state.doc, v.state.selection.from) } });
      },
    });
    view.current = v;
    // What the app reads from a textarea.
    Object.defineProperty(v.dom, "selectionStart", { get: () => offsetOf(v.state.doc, v.state.selection.from) });
    Object.defineProperty(v.dom, "value", { get: () => textOf(v.state.doc) });
    v.dom.setSelectionRange = (at) => v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, posOf(v.state.doc, at))));
    if (ref) ref.current = v.dom;
    return () => {
      if (ref) ref.current = null;
      view.current = null;
      v.destroy();
    };
  }, []);

  // A change from the app: a send clears the box, and a pick from the skills list rewrites it.
  useLayoutEffect(() => {
    const v = view.current;
    if (!v || (value ?? "") === textOf(v.state.doc)) return;
    v.updateState(stateOf(value ?? ""));
    refresh(v.state);
  }, [value]);

  // Its role and state for assistive technology, the app's, or the list's while that's open.
  useEffect(() => {
    const attributes = { role: "combobox", "aria-multiline": "true", "data-slot": "input-group-control", class: `fm-editor ${className ?? ""}`, ...aria };
    if (list) Object.assign(attributes, { "aria-expanded": "true", "aria-controls": "tag-picker", "aria-activedescendant": `tag-option-${list.active}` });
    else attributes["aria-expanded"] = String(Boolean(aria["aria-expanded"]));
    for (const name of Object.keys(attributes)) if (attributes[name] === undefined) delete attributes[name];
    view.current?.setProps({ attributes, editable: () => !disabled });
  });

  const form = view.current?.dom.closest("form");
  return (
    <div className="fm-box">
      <div ref={mount} />
      {empty && (
        <span className="fm-placeholder" aria-hidden="true">
          {placeholder}
        </span>
      )}
      <div aria-live="polite" className="sr-only">
        {said}
      </div>
      {list &&
        form &&
        createPortal(
          <div id="tag-picker" role="listbox" aria-label="Bots" className="absolute right-4 bottom-full left-4 z-10 mb-2 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md">
            {list.matches.map((choice, i) => (
              <button
                key={choice.id}
                id={`tag-option-${i}`}
                type="button"
                role="option"
                aria-selected={i === list.active}
                // Keeps the box focused, so the pick lands where the caret was.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(choice)}
                className={`flex w-full min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${i === list.active ? "bg-accent text-accent-foreground" : ""}`}
              >
                <ui.Blob {...choice} size={20} />
                <span className="grid min-w-0 flex-1">
                  <span className="font-medium">{choice.name}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{choice.about || choice.id}</span>
                </span>
              </button>
            ))}
          </div>,
          form,
        )}
      {[...chips].map(([dom, { id, name }], i) => createPortal(<Chip id={id} name={name} />, dom, `${id}-${i}`))}
    </div>
  );
}
