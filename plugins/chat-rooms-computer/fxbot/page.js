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
const Screen = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
	width: "16",
	height: "16",
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: "2",
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": "true",
	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
		x: "2",
		y: "3",
		width: "20",
		height: "14",
		rx: "2"
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 21h8M12 17v4" })]
});
function RoomComputer({ room }) {
	const { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Switch } = _fxbot_app.ui;
	const [state, setState] = (0, react.useState)(null);
	const [open, setOpen] = (0, react.useState)(false);
	const [busy, setBusy] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => void call(`rooms/${room.id}`).then(setState, () => {}), [room.id]);
	async function turn(on) {
		setBusy(true);
		setError("");
		try {
			const next = await call(`rooms/${room.id}`, "PUT", { on });
			if (!on && next.key) await fetch(`/api/plugins/computer/computers/${next.key}/stop`, { method: "POST" }).catch(() => {});
			setState(next);
		} catch (e) {
			setError(e.message);
		}
		setBusy(false);
	}
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Button, {
		variant: "ghost",
		size: "icon-sm",
		"aria-label": `${room.name}'s computer`,
		title: `${room.name}'s computer`,
		onClick: () => setOpen(true),
		style: { position: "relative" },
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Screen, {}), state?.on && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			"aria-hidden": "true",
			style: {
				position: "absolute",
				top: 4,
				right: 4,
				width: 6,
				height: 6,
				borderRadius: 3,
				background: "#22c55e"
			}
		})]
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange: setOpen,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogContent, {
			className: "sm:max-w-md",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogTitle, { children: [room.name, "'s computer"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogDescription, { children: [
					"Give ",
					room.name,
					" a computer of its own. Its bots share it in this room, taking turns, and keep their own computers for their own chats."
				] })] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "flex items-center justify-between gap-3 text-sm font-medium",
					children: ["Computer", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
						checked: Boolean(state?.on),
						disabled: busy || !state,
						onCheckedChange: turn
					})]
				}),
				state?.on && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						size: "sm",
						onClick: () => (0, _fxbot_app.go)(`/computer/computers/${state.key}`),
						children: "Open"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted-foreground",
						children: "Turning it off stops it and keeps its files."
					})]
				}),
				error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "text-sm text-destructive",
					children: error
				})
			]
		})
	})] });
}
function setup(app) {
	app.slot("chat-rooms.room-header", RoomComputer);
}
module.exports = setup;
