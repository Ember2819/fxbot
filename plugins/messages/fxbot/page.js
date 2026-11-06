let react = require("react");
let _fxbot_app = require("@fxbot/app");
let react_jsx_runtime = require("react/jsx-runtime");
// fxbot/page.jsx
async function call(path, method = "GET", body) {
	const res = await (0, _fxbot_app.api)(path, {
		method,
		...body ? {
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body)
		} : {}
	});
	const answer = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
	return answer;
}
const today = (at) => new Date(at).toDateString() === (/* @__PURE__ */ new Date()).toDateString();
const when = (at) => (today(at) ? "Today " : `${new Date(at).toLocaleDateString(void 0, {
	month: "short",
	day: "numeric"
})} `) + new Date(at).toLocaleTimeString(void 0, {
	hour: "2-digit",
	minute: "2-digit"
});
const live = (message) => message.state === "waiting" || message.state === "working";
const outcome = (message) => ({
	waiting: "Waiting",
	working: "Working…",
	failed: message.error || "Failed",
	stopped: "Stopped",
	done: message.answered ? "Answered" : "Read"
})[message.state];
const column = {
	display: "grid",
	gridTemplateColumns: "minmax(0, 1fr)"
};
const wraps = { overflowWrap: "anywhere" };
function Face({ bot }) {
	return bot ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
		shape: bot.shape,
		color: bot.color,
		size: 20
	}) : null;
}
function Row({ message, bots }) {
	const from = bots.find((bot) => bot.id === message.from);
	const to = bots.find((bot) => bot.id === message.to);
	const open = () => to && (0, _fxbot_app.go)(`/profiles/${to.id}`);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		className: "w-full gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted",
		style: column,
		onClick: open,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "flex flex-wrap items-center gap-1.5",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Face, { bot: from }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "font-medium",
						children: from?.name ?? "A bot that's gone"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "text-muted-foreground",
						children: "→"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Face, { bot: to }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "font-medium",
						children: to?.name ?? "A bot that's gone"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "ml-auto text-muted-foreground",
						children: outcome(message)
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "whitespace-pre-wrap",
				style: wraps,
				children: named(message.text)
			}),
			message.files.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "text-muted-foreground",
				style: wraps,
				children: message.files.map((file) => file.name).join(", ")
			})
		]
	}) });
}
function Thread({ conversation, most, bots, onStop }) {
	const count = conversation.messages.length;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "gap-1",
		style: column,
		"aria-label": `Conversation ${conversation.id}`,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-3 px-2",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "min-w-0 flex-1 text-muted-foreground",
				children: [
					when(conversation.at),
					" · ",
					count,
					" of ",
					most,
					conversation.stopped ? " · stopped" : ""
				]
			}), !conversation.stopped && conversation.messages.some(live) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
				type: "button",
				size: "xs",
				variant: "outline",
				onClick: () => onStop(conversation),
				children: "Stop"
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
			className: "gap-1",
			style: column,
			children: conversation.messages.map((message) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
				message,
				bots
			}, message.id))
		})]
	});
}
function Screen() {
	const bots = (0, _fxbot_app.useBots)() ?? [];
	const [data, setData] = (0, react.useState)(null);
	const [earlier, setEarlier] = (0, react.useState)([]);
	const [more, setMore] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)("");
	const load = () => call("conversations").then(setData, (e) => setError(e.message));
	(0, react.useEffect)(() => void load(), []);
	const going = data?.conversations.some((conversation) => conversation.messages.some(live));
	(0, react.useEffect)(() => {
		if (!going) return;
		const again = setTimeout(load, 5e3);
		return () => clearTimeout(again);
	}, [data]);
	const shown = [...data?.conversations ?? [], ...earlier];
	const older = async () => {
		const page = await call(`conversations?before=${shown.at(-1).id}`);
		setEarlier((all) => [...all, ...page.conversations]);
		setMore(page.older);
	};
	const stop = (conversation) => call(`conversations/${conversation.id}/stop`, "POST").then(load, (e) => setError(e.message));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "flex min-h-0 flex-1 flex-col overflow-y-auto",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Header, { title: "Messages" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "w-full gap-6 px-4 pb-6 text-sm",
			style: {
				...column,
				maxWidth: "42rem",
				marginInline: "auto"
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "text-muted-foreground",
					children: bots.length < 2 ? "With two bots or more, they message each other here to get work done, and you can watch it. Make another bot to start." : "Your bots talking to each other. Each message is in both bots' chats."
				}),
				data && !shown.length && bots.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "text-muted-foreground",
					children: "Nothing yet. Ask a bot to ask another."
				}),
				shown.map((conversation) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Thread, {
					conversation,
					most: data.most,
					bots,
					onStop: stop
				}, conversation.id)),
				(more ?? data?.older) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					className: "justify-self-start",
					onClick: () => older().catch((e) => setError(e.message)),
					children: "Older"
				}),
				error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "text-destructive",
					children: error
				})
			]
		})]
	});
}
function Sent({ call: tool }) {
	const { to, text } = tool.input ?? {};
	const out = tool.done && tool.output && !/^Sent to /.test(tool.output);
	const id = (/\/profiles\/([0-9a-f]{12})/i.exec(to ?? "")?.[1] ?? to ?? "").toLowerCase();
	const bot = ((0, _fxbot_app.useBots)() ?? []).find((b) => b.id === id);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "grid gap-1 text-sm",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "flex items-center gap-2 font-medium",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Face, { bot }),
					"To ",
					bot?.name ?? named(to) ?? "a bot"
				]
			}),
			text && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "whitespace-pre-wrap",
				style: wraps,
				children: named(text)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: out ? "text-destructive" : "text-muted-foreground",
				children: tool.done ? tool.output : "Sending…"
			})
		]
	});
}
function About({ bot }) {
	const [about, setAbout] = (0, react.useState)(null);
	const [saved, setSaved] = (0, react.useState)("");
	const [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => void call(`bots/${bot.id}`).then(({ about }) => (setAbout(about), setSaved(about)), (e) => setError(e.message)), [bot.id]);
	if (about === null) return null;
	const save = () => {
		if (about.trim() === saved) return;
		setError("");
		call(`bots/${bot.id}`, "PUT", { about }).then(({ about }) => (setAbout(about), setSaved(about)), (e) => setError(e.message));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-2 text-sm",
		"aria-label": "Messages",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "font-medium",
				children: "Messages"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "grid gap-1.5",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "text-muted-foreground",
					children: "What this bot does, for your other bots"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Input, {
					value: about,
					maxLength: 120,
					onChange: (e) => setAbout(e.target.value),
					onBlur: save
				})]
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: error
			})
		]
	});
}
const tagLink = /\[@([^\]\n]*)\]\(\/profiles\/([0-9a-f]{12})\)/g;
const named = (text) => text?.replace(tagLink, "@$1");
const safeName = (name) => name.replace(/[[\]\n]/g, "");
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inBox = (text, tag) => new RegExp(`(^|\\s)${escaped(`@${tag.name}`)}(?!\\w)`).test(text);
let tagged = [];
function linked(text) {
	if (!tagged.length) return text;
	const left = [...tagged];
	const names = [...new Set(left.map((tag) => tag.name))].sort((a, b) => b.length - a.length).map((name) => escaped(`@${name}`));
	return text.replace(new RegExp(`(^|\\s)(${names.join("|")})(?!\\w)`, "g"), (whole, before, shown) => {
		const at = left.findIndex((tag) => `@${tag.name}` === shown);
		if (at < 0) return whole;
		const [tag] = left.splice(at, 1);
		return `${before}[@${safeName(tag.name)}](/profiles/${tag.id})`;
	});
}
function Tags({ bot, draft, box, setDraft }) {
	const bots = (0, _fxbot_app.useBots)() ?? [];
	const [reach, setReach] = (0, react.useState)([]);
	const [picked, setPicked] = (0, react.useState)([]);
	const [token, setToken] = (0, react.useState)(null);
	const [active, setActive] = (0, react.useState)(0);
	const caret = (0, react.useRef)(null);
	tagged = picked;
	const load = () => void call(`/tags/${bot.id}`).then(setReach, () => {});
	(0, react.useEffect)(() => void (setPicked([]), setToken(null), load()), [bot.id]);
	(0, react.useEffect)(() => void (token && load()), [Boolean(token)]);
	(0, react.useEffect)(() => {
		if (!draft) setPicked([]);
		const at = box.current?.selectionStart ?? draft.length;
		const typed = /(?:^|\s)@([^\s@]*)$/.exec(draft.slice(0, at));
		setToken(typed ? {
			start: at - typed[1].length - 1,
			query: typed[1].toLowerCase()
		} : null);
		setActive(0);
	}, [draft]);
	(0, react.useLayoutEffect)(() => {
		if (caret.current === null || !box.current) return;
		box.current.setSelectionRange(caret.current, caret.current);
		caret.current = null;
	}, [draft]);
	const about = new Map(reach.map((one) => [one.id, one.about]));
	const lower = (b) => b.name.toLowerCase();
	const matches = token ? bots.filter((b) => about.has(b.id) && lower(b).includes(token.query)).sort((a, b) => Number(lower(b).startsWith(token.query)) - Number(lower(a).startsWith(token.query))).slice(0, 8) : [];
	const open = matches.length > 0;
	function choose(pick) {
		const shown = `@${pick.name} `;
		setDraft(draft.slice(0, token.start) + shown + draft.slice(token.start + 1 + token.query.length).replace(/^ /, ""));
		setPicked((all) => [...all, {
			id: pick.id,
			name: pick.name
		}]);
		setToken(null);
		caret.current = token.start + shown.length;
	}
	(0, react.useEffect)(() => {
		const el = box.current;
		if (!el || !open) return;
		const keys = (e) => {
			if (e.key === "ArrowDown" || e.key === "ArrowUp") setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
			else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) choose(matches[active]);
			else if (e.key === "Escape") setToken(null);
			else return;
			e.preventDefault();
			e.stopPropagation();
		};
		const blur = () => setToken(null);
		el.addEventListener("keydown", keys);
		el.addEventListener("blur", blur);
		el.setAttribute("aria-expanded", "true");
		el.setAttribute("aria-controls", "tag-picker");
		el.setAttribute("aria-activedescendant", `tag-option-${active}`);
		return () => {
			el.removeEventListener("keydown", keys);
			el.removeEventListener("blur", blur);
			el.setAttribute("aria-expanded", "false");
			el.setAttribute("aria-controls", "skill-picker");
			el.removeAttribute("aria-activedescendant");
		};
	});
	const form = box.current?.closest("form");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [picked.filter((tag) => inBox(draft, tag)).map((tag, i) => {
		const face = bots.find((b) => b.id === tag.id);
		return face ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			title: `@${tag.name}`,
			"aria-label": `Tagged ${tag.name}`,
			style: { display: "inline-flex" },
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
				shape: face.shape,
				color: face.color,
				size: 18
			})
		}, i) : null;
	}), open && form && (0, _fxbot_app.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		id: "tag-picker",
		role: "listbox",
		"aria-label": "Bots",
		className: "absolute right-4 bottom-full left-4 z-10 mb-2 max-h-72 overflow-y-auto rounded-2xl border bg-popover p-1 text-popover-foreground shadow-md",
		children: matches.map((b, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			id: `tag-option-${i}`,
			type: "button",
			role: "option",
			"aria-selected": i === active,
			onMouseDown: (e) => e.preventDefault(),
			onClick: () => choose(b),
			className: `flex w-full min-w-0 items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm ${i === active ? "bg-accent text-accent-foreground" : ""}`,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
				shape: b.shape,
				color: b.color,
				size: 20
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "grid min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "font-medium",
					children: b.name
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "line-clamp-1 text-xs text-muted-foreground",
					children: about.get(b.id) || b.id
				})]
			})]
		}, b.id))
	}), form)] });
}
function Tag({ match }) {
	const bot = ((0, _fxbot_app.useBots)() ?? []).find((b) => b.id === match[2]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		style: {
			display: "inline-flex",
			alignItems: "center",
			gap: 4,
			padding: "0 6px 0 3px",
			borderRadius: 9999,
			background: "rgb(255 255 255 / 0.2)",
			fontWeight: 500,
			verticalAlign: "bottom"
		},
		children: [
			bot && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
				shape: bot.shape,
				color: bot.color,
				size: 16
			}),
			"@",
			bot?.name ?? match[1]
		]
	});
}
function setup(app) {
	app.composer(Tags);
	app.sending(linked);
	app.said(tagLink, Tag);
	app.nav({
		label: "Messages",
		path: "/"
	});
	app.route("/", Screen);
	app.toolView("send", Sent, { open: true });
	app.botSettings(About);
}
module.exports = setup;
