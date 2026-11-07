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
const frameOf = (id, n, part = "frame") => `/api/plugins/pages/${id}/versions/${n}/${part}`;
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
function taskLines(text) {
	const tasks = [];
	let fence = null;
	text.split("\n").forEach((line, i) => {
		const mark = /^\s*(```+|~~~+)/.exec(line)?.[1];
		if (mark) fence = !fence ? mark : mark.startsWith(fence) ? null : fence;
		else if (!fence && /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]/.test(line)) tasks.push(i);
	});
	return tasks;
}
function Markdown({ title, text, onTick }) {
	const body = text.replace(/^\s*#[ \t]+(.+)\n/, (line, heading) => heading.trim() === title ? "" : line).replace(/\]\(library:([0-9a-f]{12})/g, "](/api/library/$1/file");
	const live = Boolean(onTick);
	const components = (0, react.useMemo)(() => ({
		img: Picture,
		input: ({ checked, type }) => (0, react_jsx_runtime.jsx)("input", {
			type,
			checked: Boolean(checked),
			disabled: !live,
			onChange: () => {},
			className: "pages-box"
		})
	}), [live]);
	const tick = (event) => {
		if (!live || event.target.type !== "checkbox") return;
		const boxes = [...event.currentTarget.querySelectorAll("input[type=\"checkbox\"]")];
		const tasks = taskLines(text);
		if (boxes.length === tasks.length) onTick(tasks[boxes.indexOf(event.target)], event.target.checked);
	};
	return (0, react_jsx_runtime.jsx)("div", {
		className: "pages-scroll min-h-0 flex-1 overflow-y-auto",
		children: (0, react_jsx_runtime.jsxs)("article", {
			className: "pages-column pages-print",
			onClick: tick,
			children: [(0, react_jsx_runtime.jsx)("h1", {
				className: "pages-title",
				children: title
			}), (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Streamdown, {
				mode: "static",
				components,
				children: body
			})]
		})
	});
}
function Bar({ words, detail, yes, no, onYes, onNo }) {
	const [armed, setArmed] = (0, react.useState)(false);
	(0, react.useEffect)(() => {
		const later = setTimeout(() => setArmed(true), 500);
		return () => clearTimeout(later);
	}, []);
	return (0, react_jsx_runtime.jsx)("div", {
		className: "pages-column",
		children: (0, react_jsx_runtime.jsxs)("div", {
			className: "grid gap-2 rounded-lg border p-3 text-sm",
			children: [
				(0, react_jsx_runtime.jsx)("p", { children: words }),
				detail && (0, react_jsx_runtime.jsx)("p", {
					className: "break-words text-muted-foreground",
					children: detail
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap gap-2",
					children: [(0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						size: "sm",
						disabled: !armed,
						onClick: onYes,
						children: yes
					}), (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						size: "sm",
						variant: "outline",
						onClick: onNo,
						children: no
					})]
				})
			]
		})
	});
}
function Frame({ id, n, title, onOp, data }) {
	const shell = (0, react.useRef)(null);
	const line = (0, react.useRef)(null);
	const taken = (0, react.useRef)(false);
	const ops = (0, react.useRef)(onOp);
	ops.current = onOp;
	(0, react.useLayoutEffect)(() => {
		const offer = (event) => {
			if (taken.current || event.data?.fxpage !== 1 || !event.ports[0] || event.source !== shell.current?.contentWindow?.frames[0]) return;
			taken.current = true;
			line.current = event.ports[0];
			line.current.onmessage = ({ data }) => {
				const { id: call, op, args } = data ?? {};
				if (!Number.isSafeInteger(call) || !Array.isArray(args)) return;
				const answer = (body) => line.current?.postMessage({
					id: call,
					...body
				});
				Promise.resolve().then(() => ops.current(op, args)).then((value) => answer({
					ok: true,
					value
				}), (e) => answer({
					ok: false,
					error: e.message
				}));
			};
		};
		addEventListener("message", offer);
		return () => (removeEventListener("message", offer), line.current?.close());
	}, []);
	(0, react.useEffect)(() => void line.current?.postMessage({
		event: "data",
		value: data?.data ?? null
	}), [data?.at]);
	const held = (event) => event.target.contentDocument?.querySelector("iframe")?.addEventListener("load", () => (line.current?.close(), line.current = null));
	return (0, react_jsx_runtime.jsx)("iframe", {
		ref: shell,
		title,
		src: frameOf(id, n, "shell"),
		onLoad: held,
		referrerPolicy: "no-referrer",
		className: "pages-frame min-h-0 w-full flex-1 border-0"
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
	const [bar, setBar] = (0, react.useState)(null);
	const [fresh, setFresh] = (0, react.useState)(0);
	const [data, setData] = (0, react.useState)(null);
	const [notNow, setNotNow] = (0, react.useState)(false);
	const [errors, setErrors] = (0, react.useState)([]);
	const ticking = (0, react.useRef)(false);
	const read = () => call(id).then(setPage, (e) => e.status === 404 ? setPage(null) : setError(e.message));
	(0, react.useEffect)(() => void read(), [id]);
	const newest = page?.versions[0].n;
	const n = picked ?? newest;
	(0, react.useEffect)(() => {
		if (n) call(`${id}/versions/${n}`).then(setShown, (e) => setError(e.message));
	}, [
		id,
		n,
		fresh
	]);
	const isHtml = shown?.type === "text/html";
	const readData = () => isHtml && n === shown?.n ? call(`${id}/data?n=${n}`).then(setData, () => {}) : void 0;
	(0, react.useEffect)(() => {
		readData();
		const again = () => document.visibilityState === "visible" && readData();
		addEventListener("focus", again);
		document.addEventListener("visibilitychange", again);
		return () => (removeEventListener("focus", again), document.removeEventListener("visibilitychange", again));
	}, [
		id,
		n,
		isHtml,
		shown?.n
	]);
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
	const restore = () => call(`${id}/restore`, "POST", { n }).then(() => (setPicked(null), read()), (e) => setError(e.message));
	const remove = async () => {
		if (!confirm(`Remove ${shown.title} from the library, for every bot? The chats it came from keep what the bots saw.`)) return;
		await _fxbot_app.client.library.remove(id).then(() => (0, _fxbot_app.go)("/library"), (e) => setError(e.message));
	};
	const copy = () => navigator.clipboard.writeText(shown.text).then(() => setCopied(true), (e) => setError(e.message));
	const tick = (line, done) => {
		if (ticking.current) return;
		ticking.current = true;
		call(`${id}/tick`, "POST", {
			n,
			line,
			done
		}).catch((e) => setError(e.message)).then(read).then(() => setFresh((f) => f + 1)).finally(() => ticking.current = false);
	};
	const say = (text) => {
		if (!bot) throw new Error("The bot that wrote this page is gone.");
		if (typeof text !== "string" || !text.trim() || text.length > 4e3 || text.trimStart().startsWith("/")) throw new Error("A page can't say that.");
		setBar({
			words: `This page wants to tell ${bot.name}:`,
			detail: text,
			yes: "Send",
			no: "Cancel",
			onYes: () => call(`${id}/say`, "POST", { text }).then(() => setBar({
				words: `Sent to ${bot.name}.`,
				yes: `Open ${bot.name}'s chat`,
				no: "Close",
				onYes: () => (0, _fxbot_app.go)(`/profiles/${bot.id}`)
			}), (e) => (setError(e.message), setBar(null)))
		});
	};
	const saved = (op, key, value) => call(`${id}/saved`, "POST", {
		op,
		key,
		value
	}).then((answer) => answer.value);
	const ops = {
		get: (key) => saved("get", key),
		set: (key, value) => saved("set", key, value),
		del: (key) => saved("del", key),
		list: (prefix) => saved("list", prefix),
		data: () => call(`${id}/data?n=${n}`).then((answer) => answer.data),
		say,
		error: (words) => setErrors((all) => [...all, String(words).slice(0, 4e3)].slice(-20)),
		open(address) {
			const url = URL.canParse(address) ? new URL(address) : null;
			if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("That address can't be opened.");
			setBar({
				words: "This page wants to open:",
				detail: url.href,
				yes: "Open",
				no: "Cancel",
				onYes: () => (window.open(url.href, "_blank", "noopener,noreferrer"), setBar(null))
			});
		}
	};
	const onOp = (op, args) => {
		if (!Object.hasOwn(ops, op)) throw new Error("A page can't do that.");
		return ops[op](...args);
	};
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
		bar && (0, react_jsx_runtime.jsx)(Bar, {
			...bar,
			onNo: () => setBar(null)
		}),
		!bar && data?.waiting && !notNow && n === newest && (0, react_jsx_runtime.jsx)(Bar, {
			words: `${bot?.name ?? "A bot"} wants to give this page data. A page with code can send what it holds elsewhere.`,
			yes: "Allow",
			no: "Not now",
			onYes: () => call(`${id}/allow`, "POST", { n }).then(readData, (e) => setError(e.message)),
			onNo: () => setNotNow(true)
		}),
		isHtml ? (0, react_jsx_runtime.jsx)(Frame, {
			id,
			n,
			title: shown.title,
			onOp,
			data
		}, n) : (0, react_jsx_runtime.jsx)(Markdown, {
			title: shown.title,
			text: shown.text,
			onTick: bot && n === newest ? tick : null
		}),
		errors.length > 0 && (0, react_jsx_runtime.jsxs)("div", {
			className: "pages-column pages-bar flex flex-wrap items-center gap-2 pt-2 text-sm",
			children: [(0, react_jsx_runtime.jsx)("span", {
				className: "text-muted-foreground",
				children: "This page hit an error."
			}), bot && (0, react_jsx_runtime.jsx)(Button, {
				size: "sm",
				variant: "outline",
				onClick: () => say(`This page hit an error:\n\n${errors.join("\n").slice(0, 3900)}`),
				children: "Tell the bot"
			})]
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
