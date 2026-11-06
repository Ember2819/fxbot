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
				children: message.text
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
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "grid gap-1 text-sm",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "font-medium",
				children: ["To ", to ?? "a bot"]
			}),
			text && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "whitespace-pre-wrap",
				style: wraps,
				children: text
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
function setup(app) {
	app.nav({
		label: "Messages",
		path: "/"
	});
	app.route("/", Screen);
	app.toolView("send", Sent, { open: true });
	app.botSettings(About);
}
module.exports = setup;
