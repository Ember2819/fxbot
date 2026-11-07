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
	if (!res.ok) throw Object.assign(new Error(answer.error ?? `HTTP ${res.status}`), { status: res.status });
	return answer;
}
const when = (at) => new Date(at).toLocaleString(void 0, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit"
});
const frameOf = (id, n) => `/api/plugins/pages/${id}/versions/${n}/frame`;
function Card({ call: tool }) {
	const found = /^Saved "(.*)" as library:([0-9a-f]{12}), version (\d+)\./.exec(tool.output ?? "");
	const id = found?.[2];
	const [page, setPage] = (0, react.useState)();
	(0, react.useEffect)(() => {
		if (id) call(id).then(setPage, () => setPage(null));
	}, [id]);
	if (!tool.done) return (0, react_jsx_runtime.jsxs)("p", {
		className: "text-sm text-muted-foreground",
		children: ["Writing a page…", tool.input?.title ? ` ${tool.input.title}` : ""]
	});
	if (!id) return (0, react_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted-foreground",
		children: tool.error ?? tool.output
	});
	if (page === null) return (0, react_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted-foreground",
		children: "This page was removed."
	});
	const version = Number(found[3]);
	return (0, react_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3 rounded-lg border p-3 text-sm",
		children: [(0, react_jsx_runtime.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [(0, react_jsx_runtime.jsx)("p", {
				className: "truncate font-medium",
				children: page?.title ?? JSON.parse(`"${found[1]}"`)
			}), (0, react_jsx_runtime.jsx)("p", {
				className: "text-muted-foreground",
				children: page && page.versions[0].n > version ? "Updated since" : `Version ${version}`
			})]
		}), (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
			size: "sm",
			variant: "outline",
			onClick: () => (0, _fxbot_app.go)(`/pages/${id}`),
			children: "Open"
		})]
	});
}
function Picture({ src, alt }) {
	if (String(src).startsWith("/api/library/")) return (0, react_jsx_runtime.jsx)("img", {
		src,
		alt: alt ?? "",
		className: "max-w-full rounded-lg"
	});
	return (0, react_jsx_runtime.jsx)("a", {
		href: src,
		target: "_blank",
		rel: "noreferrer",
		className: "underline underline-offset-4",
		children: alt || src
	});
}
function Markdown({ title, text }) {
	const body = text.replace(/^\s*#[ \t]+(.+)\n/, (line, heading) => heading.trim() === title ? "" : line).replace(/\]\(library:([0-9a-f]{12})/g, "](/api/library/$1/file");
	return (0, react_jsx_runtime.jsx)("div", {
		className: "pages-scroll min-h-0 flex-1 overflow-y-auto",
		children: (0, react_jsx_runtime.jsxs)("article", {
			className: "pages-column pages-print",
			children: [(0, react_jsx_runtime.jsx)("h1", {
				className: "pages-title",
				children: title
			}), (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Streamdown, {
				mode: "static",
				components: { img: Picture },
				children: body
			})]
		})
	});
}
function Reader({ params: { id } }) {
	const { Button, Blob, Header, NativeSelect } = _fxbot_app.ui;
	const [page, setPage] = (0, react.useState)();
	const bot = (0, _fxbot_app.useBots)()?.find((b) => b.id === page?.bot);
	const [picked, setPicked] = (0, react.useState)(null);
	const [shown, setShown] = (0, react.useState)(null);
	const [copied, setCopied] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const read = () => call(id).then(setPage, (e) => e.status === 404 ? setPage(null) : setError(e.message));
	(0, react.useEffect)(() => void read(), [id]);
	const newest = page?.versions[0].n;
	const n = picked ?? newest;
	(0, react.useEffect)(() => {
		if (n) call(`${id}/versions/${n}`).then(setShown, (e) => setError(e.message));
	}, [id, n]);
	if (page === null) return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Header, { title: "Page" }), (0, react_jsx_runtime.jsxs)("div", {
		className: "pages-column grid gap-3 text-sm",
		children: [(0, react_jsx_runtime.jsx)("p", { children: "This page was removed." }), (0, react_jsx_runtime.jsx)(Button, {
			variant: "outline",
			size: "sm",
			className: "justify-self-start",
			onClick: () => (0, _fxbot_app.go)("/library"),
			children: "Open the library"
		})]
	})] });
	if (!page || !shown) return (0, react_jsx_runtime.jsx)(Header, { title: error || "Page" });
	const isHtml = shown.type === "text/html";
	const restore = () => call(`${id}/restore`, "POST", { n }).then(() => (setPicked(null), read()), (e) => setError(e.message));
	const remove = async () => {
		if (!confirm(`Remove ${shown.title} from the library, for every bot? The chats it came from keep what the bots saw.`)) return;
		await _fxbot_app.client.library.remove(id).then(() => (0, _fxbot_app.go)("/library"), (e) => setError(e.message));
	};
	const copy = () => navigator.clipboard.writeText(shown.text).then(() => setCopied(true), (e) => setError(e.message));
	return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		(0, react_jsx_runtime.jsx)(Header, { title: shown.title }),
		(0, react_jsx_runtime.jsxs)("div", {
			className: "pages-column pages-bar grid gap-2 text-sm",
			children: [
				(0, react_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-x-3 gap-y-2",
					children: [
						bot && (0, react_jsx_runtime.jsx)(Blob, {
							shape: bot.shape,
							color: bot.color,
							size: 20
						}),
						(0, react_jsx_runtime.jsxs)("span", {
							className: "min-w-0 text-muted-foreground",
							children: [
								bot ? bot.name : "A bot you removed",
								" · ",
								when(shown.at)
							]
						}),
						page.versions.length > 1 && (0, react_jsx_runtime.jsx)(NativeSelect, {
							"aria-label": "Version",
							value: n,
							onChange: (e) => setPicked(Number(e.target.value)),
							children: page.versions.map((v) => (0, react_jsx_runtime.jsxs)("option", {
								value: v.n,
								children: ["Version ", v.n]
							}, v.n))
						})
					]
				}),
				n !== newest && (0, react_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							className: "text-muted-foreground",
							children: [
								"Version ",
								n,
								" of ",
								newest,
								", ",
								when(shown.at)
							]
						}),
						bot && (0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							onClick: restore,
							children: "Restore"
						}),
						(0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "outline",
							onClick: () => setPicked(null),
							children: "Back to the newest"
						})
					]
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [
						(0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "outline",
							onClick: copy,
							children: copied ? "Copied" : "Copy"
						}),
						isHtml ? (0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "outline",
							onClick: () => window.open(frameOf(id, n), "_blank", "noreferrer"),
							children: "Open in a tab"
						}) : (0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "outline",
							onClick: () => window.print(),
							children: "Print"
						}),
						(0, react_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "outline",
							onClick: remove,
							children: "Delete"
						}),
						bot && (0, react_jsx_runtime.jsxs)(Button, {
							size: "sm",
							variant: "ghost",
							onClick: () => (0, _fxbot_app.go)(`/profiles/${bot.id}`),
							children: [
								"Open ",
								bot.name,
								"'s chat"
							]
						})
					]
				}),
				error && (0, react_jsx_runtime.jsx)("p", {
					role: "alert",
					className: "text-destructive",
					children: error
				})
			]
		}),
		isHtml ? (0, react_jsx_runtime.jsx)("iframe", {
			title: shown.title,
			src: frameOf(id, n),
			sandbox: "allow-scripts allow-popups allow-popups-to-escape-sandbox",
			referrerPolicy: "no-referrer",
			className: "pages-frame min-h-0 w-full flex-1 border-0"
		}, n) : (0, react_jsx_runtime.jsx)(Markdown, {
			title: shown.title,
			text: shown.text
		})
	] });
}
function OpenPage({ item }) {
	const [page, setPage] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		if (item.kind === "document") call(item.id).then(() => setPage(true), () => {});
	}, [item.id]);
	return page ? (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
		variant: "outline",
		onClick: () => (0, _fxbot_app.go)(`/pages/${item.id}`),
		children: "Open page"
	}) : null;
}
function setup(app) {
	app.route("/:id", Reader);
	app.toolView("write", Card, { open: true });
	app.toolView("edit", Card, { open: true });
	app.toolView("html", Card, { open: true });
	app.libraryItem(OpenPage);
}
module.exports = setup;
