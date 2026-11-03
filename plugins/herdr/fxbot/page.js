let react_jsx_runtime = require("react/jsx-runtime");
// fxbot/page.jsx
const statusText = {
	working: "Working",
	blocked: "Waiting for you",
	done: "Done",
	idle: "Idle",
	unknown: "Unknown"
};
function Agents({ call }) {
	if (!call.done) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted-foreground",
		children: "Asking herdr…"
	});
	let agents = null;
	try {
		agents = JSON.parse(call.output ?? "");
	} catch {}
	if (!Array.isArray(agents)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: `text-sm ${call.error ? "text-destructive" : ""}`,
		children: call.output
	});
	if (!agents.length) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted-foreground",
		children: "herdr runs no agents."
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "overflow-x-auto rounded-md border",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
			className: "w-full text-left text-xs",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", {
				className: "bg-muted/50 text-muted-foreground",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
						className: "px-2 py-1.5 font-medium",
						children: "Pane"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
						className: "px-2 py-1.5 font-medium",
						children: "Agent"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
						className: "px-2 py-1.5 font-medium",
						children: "Status"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
						className: "px-2 py-1.5 font-medium",
						children: "Folder"
					})
				] })
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: agents.map((a) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
				className: "border-t",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
						className: "px-2 py-1.5 font-mono",
						children: a.pane
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
						className: "px-2 py-1.5",
						children: a.agent
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
						className: `px-2 py-1.5 ${a.status === "blocked" ? "font-medium text-destructive" : ""}`,
						children: statusText[a.status] ?? a.status
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
						className: "max-w-48 truncate px-2 py-1.5 font-mono",
						title: a.folder,
						children: a.folder
					})
				]
			}, a.pane)) })]
		})
	});
}
function setup(app) {
	app.toolView("list_agents", Agents);
}
module.exports = setup;
