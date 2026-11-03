let react = require("react");
let _fxbot_app = require("@fxbot/app");
let react_jsx_runtime = require("react/jsx-runtime");
// fxbot/page.jsx
async function call(path, method = "GET") {
	const res = await (0, _fxbot_app.api)(path, { method });
	const answer = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
	return answer;
}
function useStatus() {
	const [status, setStatus] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)("");
	const load = () => call("status").then((next) => (setStatus(next), setError("")), (e) => setError(e.message));
	(0, react.useEffect)(() => void load(), []);
	(0, react.useEffect)(() => {
		if (!status?.building) return;
		const timer = setTimeout(load, 2e3);
		return () => clearTimeout(timer);
	}, [status]);
	const act = (path, method = "POST") => call(path, method).then(setStatus, (e) => setError(e.message));
	return {
		status,
		error,
		act
	};
}
const size = (n) => n == null ? "" : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.ceil(n / 1e3)} kB`;
const ago = (at) => {
	const minutes = Math.round((Date.now() - at) / 6e4);
	return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};
const Code = ({ children }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
	className: "overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap",
	children
});
function Engine({ status }) {
	const { Button } = _fxbot_app.ui;
	const [script, setScript] = (0, react.useState)(null);
	const { engine, command } = status;
	if (engine.state === "ready") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
		className: "text-sm",
		children: [
			engine.name,
			" ",
			engine.version,
			", rootless, at ",
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "font-mono text-xs break-all",
				children: engine.socket
			}),
			"."
		]
	});
	const read = () => script ? setScript(null) : (0, _fxbot_app.api)("script").then((res) => res.text()).then(setScript);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "grid gap-2",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-sm",
				children: engine.state === "rootful" ? "This engine runs as root, so the computer won't use it. Run the setup script on the machine, as root:" : "The computer's engine isn't set up on this machine yet. Run this on the machine, once, as root:"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Code, { children: command }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted-foreground",
				children: "It makes a user of its own that runs this machine's podman or docker rootless, and a firewall that keeps its computers to the internet. Read it before you run it."
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
				size: "sm",
				variant: "outline",
				className: "justify-self-start",
				onClick: read,
				children: script ? "Hide the script" : "Read the script"
			}),
			script && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
				className: "max-h-96 overflow-auto rounded-md border p-3 font-mono text-xs",
				children: script
			})
		]
	});
}
function SettingsSection() {
	const { Button } = _fxbot_app.ui;
	const { status, error, act } = useStatus();
	const ready = status?.engine.state === "ready";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "grid gap-3",
		"aria-label": "Computer",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "font-medium",
				children: "Computer"
			}),
			status && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Engine, { status }),
			ready && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "grid gap-1.5 text-sm",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						"Image ",
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "font-mono text-xs",
							children: status.image.tag.split(":")[1]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "text-muted-foreground",
							children: status.image.size ? `, ${size(status.image.size)}` : status.building ? ", building" : ", made on a bot's first call"
						})
					] }),
					status.building && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Code, { children: status.building.join("\n") }),
					status.buildError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "text-destructive",
						children: status.buildError
					})
				]
			}),
			ready && status.computers.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: "divide-y rounded-xl border text-sm",
				children: status.computers.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
					className: "flex items-center gap-3 px-3 py-2",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "min-w-0 flex-1 truncate font-medium",
						children: c.name
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "text-muted-foreground",
						children: [
							c.running ? "Running" : "Stopped",
							c.used ? `, used ${ago(c.used)}` : "",
							c.home != null ? `, home ${size(c.home)}` : ""
						]
					})]
				}, c.bot))
			}),
			ready && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "outline",
					disabled: Boolean(status.building),
					onClick: () => act("rebuild"),
					children: "Rebuild image"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "outline",
					disabled: !status.computers.length,
					onClick: () => confirm("Delete every bot's computer, with its home and what it installed?") && act("computers", "DELETE"),
					children: "Delete all computers"
				})]
			}),
			ready && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-xs text-muted-foreground",
				children: "Removing the plugin keeps the computers and their homes. Delete all computers removes them."
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-sm text-destructive",
				children: error
			})
		]
	});
}
function BotSection({ bot }) {
	const { Button } = _fxbot_app.ui;
	const { status, error, act } = useStatus();
	if (!status || status.engine.state !== "ready") return null;
	const mine = status.computers.find((c) => c.bot === bot.id);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
		className: "grid gap-2",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", {
				className: "mb-1.5 text-sm font-medium",
				children: "Computer"
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-sm text-muted-foreground",
				children: !mine ? "None yet: it starts on the bot's first call." : `${mine.running ? "Running" : "Stopped"}${mine.used ? `, used ${ago(mine.used)}` : ""}${mine.home != null ? `, home ${size(mine.home)}` : ""}.`
			}),
			mine && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					disabled: !mine.running,
					onClick: () => act(`bots/${bot.id}/stop`),
					children: "Stop"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					type: "button",
					size: "sm",
					variant: "outline",
					onClick: () => confirm(`Reset ${bot.name}'s computer? Its home and what it installed are deleted.`) && act(`bots/${bot.id}/reset`),
					children: "Reset"
				})]
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-sm text-destructive",
				children: error
			})
		]
	});
}
function setup(app) {
	app.settings(SettingsSection);
	app.botSettings(BotSection);
}
module.exports = setup;
