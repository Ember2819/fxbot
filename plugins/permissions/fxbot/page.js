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
let asks = [];
let busy = false;
let timer = null;
let reads = 0;
const listeners = /* @__PURE__ */ new Set();
const tell = () => listeners.forEach((listen) => listen());
async function read() {
	clearTimeout(timer);
	const mine = ++reads;
	if (document.visibilityState === "visible") {
		const next = await call("asks").catch(() => null);
		if (next && mine === reads) asks = next, tell();
	}
	if (mine !== reads) return;
	timer = listeners.size ? setTimeout(read, busy || asks.some((ask) => ask.state === "open") ? 3e3 : 15e3) : null;
}
const subscribe = (listen) => {
	listeners.add(listen);
	if (!timer) read();
	return () => void listeners.delete(listen);
};
function useAsks() {
	const working = Boolean((0, _fxbot_app.useBots)()?.some((bot) => bot.busy));
	(0, react.useEffect)(() => {
		const started = working && !busy;
		busy = working;
		if (started) read();
	}, [working]);
	return (0, react.useSyncExternalStore)(subscribe, () => asks);
}
const answer = (ask, body) => call(`asks/${ask.id}`, "POST", body).then((result) => (read(), result));
const fold = 600;
const shown = (input) => typeof input?.command === "string" && Object.keys(input).length <= 2 ? input.command : JSON.stringify(input, null, 2);
const left = (at) => Math.max(1, Math.ceil((new Date(at).getTime() - Date.now()) / 6e4));
function Action({ input }) {
	const [open, setOpen] = (0, react.useState)(false);
	const text = shown(input);
	const long = text.length > fold;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "grid gap-1",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
			className: "rounded-md bg-muted px-2 py-1.5 text-xs whitespace-pre-wrap",
			style: {
				overflowWrap: "anywhere",
				margin: 0
			},
			children: long && !open ? `${text.slice(0, fold)}…` : text
		}), long && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
			type: "button",
			size: "xs",
			variant: "ghost",
			className: "justify-self-start",
			onClick: () => setOpen(!open),
			children: open ? "Show less" : "Show all"
		})]
	});
}
function Card({ ask, name }) {
	const [denying, setDenying] = (0, react.useState)(false);
	const [note, setNote] = (0, react.useState)("");
	const [error, setError] = (0, react.useState)("");
	const [sent, setSent] = (0, react.useState)(false);
	const send = (body) => {
		setError("");
		setSent(true);
		answer(ask, body).catch((e) => (setError(e.message), setSent(false)));
	};
	const always = ask.exact ? "Always allow this" : `Always allow ${ask.tool}`;
	const expired = ask.state === "expired";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-2 rounded-lg border bg-background p-3 text-sm",
		"aria-label": `${name} wants to use ${ask.tool}`,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "font-medium",
				style: { overflowWrap: "anywhere" },
				children: [
					name,
					" wants to use ",
					ask.tool
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Action, { input: ask.input }),
			ask.reason && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: ask.reason }),
			expired ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "text-muted-foreground",
				children: [
					"Expired. ",
					name,
					" didn't do this."
				]
			}) : ask.background && ask.expiresAt && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "text-muted-foreground",
				children: [
					"You didn't start this. It expires in ",
					left(ask.expiresAt),
					" ",
					left(ask.expiresAt) === 1 ? "minute" : "minutes",
					"."
				]
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: error
			}),
			denying ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Input, {
						"aria-label": "Say why, if you like",
						placeholder: "Say why, if you like",
						value: note,
						maxLength: 500,
						className: "flex-1",
						style: { minWidth: "10rem" },
						onChange: (e) => setNote(e.target.value)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						type: "button",
						size: "sm",
						variant: "destructive",
						disabled: sent,
						onClick: () => send({
							answer: "deny",
							note
						}),
						children: "Deny"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						type: "button",
						size: "sm",
						variant: "ghost",
						onClick: () => setDenying(false),
						children: "Back"
					})
				]
			}) : expired ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					disabled: sent,
					onClick: () => send({ answer: "always" }),
					children: always
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					type: "button",
					size: "sm",
					variant: "ghost",
					disabled: sent,
					onClick: () => send({ answer: "dismiss" }),
					children: "Dismiss"
				})]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						type: "button",
						size: "sm",
						disabled: sent,
						onClick: () => send({ answer: "once" }),
						children: "Approve once"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						type: "button",
						size: "sm",
						variant: "outline",
						disabled: sent,
						onClick: () => send({ answer: "always" }),
						children: always
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						type: "button",
						size: "sm",
						variant: "ghost",
						disabled: sent,
						onClick: () => setDenying(true),
						children: "Deny"
					})
				]
			})
		]
	});
}
function Cards({ bot }) {
	return useAsks().filter((ask) => ask.bot === bot.id).map((ask) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
		ask,
		name: bot.name
	}, ask.id));
}
function RoomCards({ room }) {
	const bots = (0, _fxbot_app.useBots)() ?? [];
	const [open, setOpen] = (0, react.useState)(false);
	const mine = useAsks().filter((ask) => ask.state === "open" && room.members?.includes(ask.bot));
	if (!mine.length) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.Button, {
		type: "button",
		size: "sm",
		variant: "outline",
		onClick: () => setOpen(true),
		children: [mine.length, " waiting on you"]
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Dialog, {
		open,
		onOpenChange: setOpen,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogContent, {
			className: "overflow-y-auto",
			style: { maxHeight: "85dvh" },
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogHeader, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogTitle, { children: "Waiting on you" }) }), mine.map((ask) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
				ask,
				name: bots.find((bot) => bot.id === ask.bot)?.name ?? "A bot"
			}, ask.id))]
		})
	})] });
}
function Waiting() {
	const bots = (0, _fxbot_app.useBots)() ?? [];
	const open = useAsks().filter((ask) => ask.state === "open");
	if (!open.length) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.SidebarGroup, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarGroupLabel, { children: "Waiting on you" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarMenu, { children: open.map((ask) => {
		const bot = bots.find((one) => one.id === ask.bot);
		return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarMenuItem, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.SidebarMenuButton, {
			onClick: () => (0, _fxbot_app.go)(`/profiles/${ask.bot}`),
			children: [bot && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
				shape: bot.shape,
				color: bot.color,
				size: 20
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "truncate",
				children: [
					bot?.name ?? "A bot",
					": ",
					ask.tool
				]
			})]
		}) }, ask.id);
	}) })] });
}
const modes = [
	[
		"ask",
		"Ask",
		"Asks you before anything but a safe tool."
	],
	[
		"auto",
		"Auto",
		"A reviewer model checks risky calls against what you said, and asks you when it's unsure."
	],
	[
		"yolo",
		"Yolo",
		"Runs everything, with no checks."
	]
];
function Modes({ mode, onPick }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "grid gap-1.5",
		role: "radiogroup",
		"aria-label": "Permission mode",
		children: modes.map(([value, label, about]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
			type: "button",
			role: "radio",
			"aria-checked": mode === value,
			variant: mode === value ? "default" : "outline",
			className: "h-auto justify-start py-2 text-left whitespace-normal",
			onClick: () => onPick(value),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [label, "."] }),
				" ",
				about
			] })
		}, value))
	});
}
const Shield = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
	xmlns: "http://www.w3.org/2000/svg",
	width: "16",
	height: "16",
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: "2",
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": "true",
	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" })
});
function ModeButton({ bot }) {
	const [mode, setMode] = (0, react.useState)(null);
	const [open, setOpen] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => void call(`bots/${bot.id}`).then((data) => setMode(data.mode), () => {}), [bot.id, open]);
	if (!mode) return null;
	const pick = (next) => call(`bots/${bot.id}`, "PUT", { mode: next }).then(() => (setMode(next), setOpen(false), void read()), (e) => setError(e.message));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
		type: "button",
		variant: "ghost",
		size: "icon-sm",
		className: "rounded-full",
		"aria-label": `Permissions: ${mode}`,
		title: `Permissions: ${mode}`,
		onClick: () => setOpen(true),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Shield, {})
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Dialog, {
		open,
		onOpenChange: setOpen,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogContent, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogHeader, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogTitle, { children: [
				"What ",
				bot.name,
				" can do alone"
			] }) }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modes, {
				mode,
				onPick: pick
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-sm text-destructive",
				children: error
			})
		] })
	})] });
}
const outcome = {
	open: "Waiting",
	allowed: "Allowed",
	denied: "Denied",
	expired: "Expired",
	closed: "Closed"
};
function Section({ bot }) {
	const [data, setData] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)("");
	const load = () => call(`bots/${bot.id}`).then(setData, (e) => setError(e.message));
	(0, react.useEffect)(() => void load(), [bot.id]);
	if (!data) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-3 text-sm",
		"aria-label": "Permissions",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "font-medium",
				children: "Permissions"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Modes, {
				mode: data.mode,
				onPick: (mode) => call(`bots/${bot.id}`, "PUT", { mode }).then(load, (e) => setError(e.message))
			}),
			data.rules.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: "grid gap-1.5",
				children: data.rules.map((rule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "min-w-0 flex-1",
						style: { overflowWrap: "anywhere" },
						children: [rule.tool, rule.input ? `: ${rule.input}` : ""]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						type: "button",
						size: "xs",
						variant: "ghost",
						onClick: () => call(`rules/${rule.id}`, "DELETE").then(load, (e) => setError(e.message)),
						children: "Remove"
					})]
				}, rule.id))
			}),
			data.cards.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: "grid gap-1 text-muted-foreground",
				children: data.cards.map((ask) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: "flex gap-3",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "min-w-0 flex-1 truncate",
						children: ask.tool
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: outcome[ask.state] })]
				}, ask.id))
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: error
			})
		]
	});
}
function Reviewer() {
	const [picked, setPicked] = (0, react.useState)(null);
	const [providers, setProviders] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => {
		call("reviewer").then(setPicked, (e) => setError(e.message));
		_fxbot_app.client.providers.list().then(setProviders, () => {});
	}, []);
	if (!picked) return null;
	const save = (next) => (setPicked(next), (!next.provider || next.model) && void call("reviewer", "PUT", next).catch((e) => setError(e.message)));
	const gone = picked.provider && providers.length > 0 && !providers.some((p) => p.id === picked.provider);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-2 text-sm",
		"aria-label": "Reviewer",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "font-medium",
				children: "Reviewer"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: "The model that checks a risky call in auto, for every bot."
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.NativeSelect, {
				"aria-label": "Reviewer's provider",
				className: "w-full",
				value: gone ? "" : picked.provider,
				onChange: (e) => save({
					provider: e.target.value,
					model: ""
				}),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.NativeSelectOption, {
					value: "",
					children: "The bot's own model"
				}), providers.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.NativeSelectOption, {
					value: p.id,
					children: p.name
				}, p.id))]
			}),
			picked.provider && !gone && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.ModelField, {
				id: "reviewer",
				provider: picked.provider,
				value: picked.model,
				onChange: (model) => save({
					...picked,
					model
				}),
				placeholder: "Pick a model"
			}),
			gone && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: "That provider is gone, so reviews fail and every risky call asks you. Pick another."
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: error
			})
		]
	});
}
function setup(app) {
	app.chat(Cards);
	app.composer(ModeButton);
	app.sidebar(Waiting);
	app.botSettings(Section);
	app.settings(Reviewer);
	app.slot("chat-rooms.room-header", RoomCards);
}
module.exports = setup;
