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
const when = (at, timeZone, weekday) => new Intl.DateTimeFormat(void 0, {
	timeZone,
	month: "short",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
	...weekday ? { weekday: "short" } : {}
}).format(new Date(at));
const outcome = (run) => ({
	running: "Running…",
	done: run.untold ? "Couldn't reach the chat" : "Told you",
	quiet: "Nothing to say",
	failed: `Failed: ${run.reply}`,
	stopped: run.reply || "Stopped",
	skipped: "Skipped: the last run was still going",
	missed: "Missed: fxbot wasn't running"
})[run.state];
function Run({ run, timeZone, onShow, onStop }) {
	const { Button } = _fxbot_app.ui;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: "flex flex-wrap items-center gap-x-3 gap-y-1",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "text-muted-foreground tabular-nums",
				children: when(run.startedAt, timeZone)
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "min-w-0 flex-1 break-words",
				children: outcome(run)
			}),
			run.state === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
				type: "button",
				size: "xs",
				variant: "outline",
				onClick: () => onStop(run),
				children: "Stop"
			}),
			run.state === "done" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
				type: "button",
				size: "xs",
				variant: "ghost",
				onClick: () => onShow(run),
				children: "Show"
			}),
			run.files.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
				href: file.url,
				target: "_blank",
				rel: "noreferrer",
				className: "underline underline-offset-4",
				children: file.name
			}, file.url))
		]
	});
}
function Routines({ bot }) {
	const { Button, Switch, Dialog, DialogContent, DialogHeader, DialogTitle } = _fxbot_app.ui;
	const [data, setData] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)("");
	const [shown, setShown] = (0, react.useState)(null);
	const load = () => call(`bots/${bot.id}`).then(setData, (e) => setError(e.message));
	const act = (work) => (setError(""), work.then(load, (e) => setError(e.message)));
	(0, react.useEffect)(() => void load(), [bot.id]);
	const going = data?.routines.some((r) => r.runs.some((run) => run.state === "running"));
	(0, react.useEffect)(() => {
		if (!going) return;
		const again = setTimeout(load, 5e3);
		return () => clearTimeout(again);
	}, [data]);
	if (!data) return null;
	const { timeZone } = data;
	const remove = (r) => window.confirm(`Remove the routine ${r.name}?`) && act(call(`routines/${r.id}`, "DELETE"));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-3 text-sm",
		"aria-label": "Routines",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "font-medium",
				children: "Routines"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: data.on ? `Times are in ${timeZone}, from Settings › General. To add or change a routine, ask this bot.` : "routines is off for this bot, so its routines don't run."
			}),
			data.routines.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: "grid gap-4",
				children: data.routines.map((r) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: "grid gap-1.5",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "min-w-0 flex-1 truncate font-medium",
								children: r.name
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
								"aria-label": `Run ${r.name}`,
								checked: !r.paused,
								disabled: !r.nextAt,
								onCheckedChange: (on) => act(call(`routines/${r.id}`, "PUT", { paused: !on }))
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "text-muted-foreground",
							children: [r.words, r.pausedByFailures ? ` · paused after ${r.failures} failures` : r.paused ? " · paused" : r.nextAt ? ` · next ${when(r.nextAt, timeZone, true)}` : " · finished"]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "break-words",
							children: r.task
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "flex gap-2",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								size: "sm",
								variant: "outline",
								disabled: !data.on || r.runs.some((run) => run.state === "running"),
								onClick: () => act(call(`routines/${r.id}/run`, "POST")),
								children: "Run now"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								type: "button",
								size: "sm",
								variant: "ghost",
								onClick: () => remove(r),
								children: "Remove"
							})]
						}),
						r.runs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: "grid gap-1",
							children: r.runs.map((run) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Run, {
								run,
								timeZone,
								onShow: setShown,
								onStop: (one) => act(call(`runs/${one.id}/stop`, "POST"))
							}, run.id))
						})
					]
				}, r.id))
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
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogHeader, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogTitle, { children: shown && when(shown.startedAt, timeZone) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "text-xs whitespace-pre-wrap",
						children: shown?.reply
					})]
				})
			})
		]
	});
}
function Added({ call: tool }) {
	const { Button } = _fxbot_app.ui;
	const [removed, setRemoved] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const id = /^Added r:(\d+)/.exec(tool.output ?? "")?.[1];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "grid gap-1.5 text-sm",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: tool.done ? tool.output : "Saving a routine…"
			}),
			id && !removed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
				type: "button",
				size: "sm",
				variant: "outline",
				className: "justify-self-start",
				onClick: () => call(`routines/${id}`, "DELETE").then(() => setRemoved(true), (e) => setError(e.message)),
				children: "Remove"
			}),
			removed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: "Removed."
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-destructive",
				children: error
			})
		]
	});
}
function setup(app) {
	app.botSettings(Routines);
	app.toolView("add", Added, { open: true });
}
module.exports = setup;
