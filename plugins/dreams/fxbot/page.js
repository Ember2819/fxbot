let react = require("react");
let _fxbot_app = require("@fxbot/app");
let react_jsx_runtime = require("react/jsx-runtime");
// plugins/dreams/fxbot/page.jsx
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
const dayOf = (night) => (/* @__PURE__ */ new Date(`${String(night).slice(0, 10)}T12:00:00`)).toLocaleDateString(void 0, {
	month: "short",
	day: "numeric"
});
const hourOf = (hour) => `${String(hour).padStart(2, "0")}:00`;
const turns = (n) => `${n} ${n === 1 ? "turn" : "turns"}`;
const what = (c) => c.kind === "skill" ? c.before ? "Rewrote a skill" : "Made a skill" : c.merged_into ? "Merged a memory" : c.before ? "Changed a memory" : "Saved a memory";
function nightLine(n) {
	if (n.state === "dreaming") return `${dayOf(n.night)} · Dreaming…`;
	if (n.state === "off") return `${dayOf(n.night)} · dreams is off for this bot`;
	const read = n.turns ? `read ${turns(n.turns)}${n.left_out ? `, ${n.left_out} left out` : ""}` : "nothing to read";
	return `${dayOf(n.night)} · ${read} · ${n.state === "failed" ? `Failed: ${n.summary}` : n.summary || "Done."}`;
}
function Change({ change, onUndo, problem, onShow }) {
	const { Button } = _fxbot_app.ui;
	const now = change.kind === "skill" ? change.target : change.after.text;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: "grid gap-1 py-2",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "flex-1 text-muted-foreground",
						children: what(change)
					}),
					change.kind === "skill" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "sm",
						variant: "ghost",
						onClick: () => onShow({
							name: change.target,
							...change.after
						}),
						children: "Show"
					}),
					change.undone_at ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "text-xs text-muted-foreground",
						children: "Undone"
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "sm",
						variant: "outline",
						onClick: () => onUndo(change),
						children: "Undo"
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "break-words",
				children: now
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "grid gap-1 text-xs text-muted-foreground",
				children: [
					change.kind === "memory" && change.before && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["was: ", change.before.text] }),
					change.merged_into && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						"merged into ",
						change.merged_into,
						", which already said that"
					] }),
					change.sources.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						s.id,
						", ",
						s.at,
						": “",
						s.owner,
						"”"
					] }, s.id)),
					problem && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "text-destructive",
						children: problem
					})
				]
			})
		]
	});
}
function Dreams({ bot }) {
	const { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } = _fxbot_app.ui;
	const [data, setData] = (0, react.useState)(null);
	const [older, setOlder] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)("");
	const [problems, setProblems] = (0, react.useState)({});
	const [shown, setShown] = (0, react.useState)(null);
	const load = () => call(`bots/${bot.id}`).then((next) => (setData(next), setError("")), (e) => setError(e.message));
	(0, react.useEffect)(() => void (setOlder([]), load()), [bot.id]);
	(0, react.useEffect)(() => {
		if (!data?.dreaming) return;
		const timer = setInterval(load, 5e3);
		return () => clearInterval(timer);
	}, [data?.dreaming]);
	if (!data) return error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "text-sm text-destructive",
		children: error
	}) : null;
	const dreamNow = () => call(`bots/${bot.id}/dream`, "POST").then(() => setTimeout(load, 1e3), (e) => setError(e.message));
	const undo = (change) => call(`changes/${change.id}/undo`, "POST").then(() => (setProblems((all) => ({
		...all,
		[change.id]: ""
	})), load()), (e) => setProblems((all) => ({
		...all,
		[change.id]: e.message
	})));
	const nights = [...data.nights, ...older];
	const more = () => call(`bots/${bot.id}?before=${nights.at(-1).id}`).then((next) => setOlder((all) => [...all, ...next.nights]), (e) => setError(e.message));
	const remove = (name) => window.confirm(`Remove the skill ${name}? It came from a dream.`) && call(`bots/${bot.id}/skills/${encodeURIComponent(name)}`, "DELETE").then(load, (e) => setError(e.message));
	const when = `${hourOf(data.hour)}, ${data.timeZone}`;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-3 text-sm",
		"aria-label": "Dreams",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: "flex-1 font-medium",
					children: "Dreams"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					disabled: data.dreaming,
					onClick: dreamNow,
					children: "Dream now"
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: data.dreaming ? "Dreaming…" : `Each night at ${when}, from Settings › General, after ${turns(data.minTurns)}. ${turns(data.waiting)} since the last dream.`
			}),
			nights.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: "grid gap-3",
				children: nights.map((n) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: "grid gap-1",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "font-medium",
						children: nightLine(n)
					}), n.changes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "divide-y",
						children: n.changes.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Change, {
							change: c,
							problem: problems[c.id],
							onUndo: undo,
							onShow: setShown
						}, c.id))
					})]
				}, n.id))
			}),
			data.nights.length === 14 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
				type: "button",
				size: "sm",
				variant: "ghost",
				className: "justify-self-start",
				onClick: more,
				children: "Older"
			}),
			data.skills.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "grid gap-1",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: "font-medium",
					children: "Skills from dreams"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "divide-y",
					children: data.skills.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
						className: "grid gap-1 py-2",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "flex-1 truncate font-medium",
									children: s.name
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									size: "sm",
									variant: "ghost",
									onClick: () => setShown(s),
									children: "Show"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									type: "button",
									size: "sm",
									variant: "ghost",
									onClick: () => remove(s.name),
									children: "Remove"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "break-words text-muted-foreground",
							children: s.description
						})]
					}, s.name))
				})]
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: error
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dialog, {
				open: Boolean(shown),
				onOpenChange: (open) => !open && setShown(null),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogContent, {
					className: "overflow-y-auto",
					style: {
						maxHeight: "85dvh",
						maxWidth: "min(42rem, calc(100% - 2rem))"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogTitle, { children: shown?.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogDescription, { children: shown?.description })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "text-xs whitespace-pre-wrap",
						children: shown?.instructions
					})]
				})
			})
		]
	});
}
function setup(app) {
	app.botSettings(Dreams);
}
module.exports = setup;
