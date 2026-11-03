let react = require("react");
let _fxbot_app = require("@fxbot/app");
let react_jsx_runtime = require("react/jsx-runtime");
// fxbot/page.jsx
const pathOf = (room) => `/chat-rooms/rooms/${room.id}`;
let rooms = null;
const listeners = /* @__PURE__ */ new Set();
async function reload() {
	const res = await (0, _fxbot_app.api)("/rooms").catch(() => null);
	rooms = res?.ok ? await res.json() : rooms ?? [];
	listeners.forEach((listen) => listen());
}
function useRooms() {
	const [, bump] = (0, react.useState)(0);
	(0, react.useEffect)(() => {
		const listen = () => bump((n) => n + 1);
		listeners.add(listen);
		if (rooms === null) reload();
		return () => void listeners.delete(listen);
	}, []);
	return rooms;
}
async function call(path, method, body) {
	const res = await (0, _fxbot_app.api)(path, {
		method,
		headers: { "content-type": "application/json" },
		body: body === void 0 ? void 0 : JSON.stringify(body)
	});
	const answer = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(answer.error ?? `HTTP ${res.status}`);
	return answer;
}
const Plus = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: "2",
	strokeLinecap: "round",
	"aria-hidden": "true",
	children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12h14" })
});
function BotPicker({ chosen, onChange }) {
	const bots = (0, _fxbot_app.useBots)() ?? [];
	const toggle = (id, on) => onChange(on ? [...chosen, id] : chosen.filter((bot) => bot !== id));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "grid gap-2",
		children: [bots.map((bot) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
			className: "flex items-center gap-3 text-sm",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Checkbox, {
					checked: chosen.includes(bot.id),
					onCheckedChange: (on) => toggle(bot.id, on === true)
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
					shape: bot.shape,
					color: bot.color,
					size: 24
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "min-w-0 flex-1 truncate",
					children: bot.name
				}),
				chosen.includes(bot.id) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "text-xs text-muted-foreground tabular-nums",
					children: chosen.indexOf(bot.id) + 1
				})
			]
		}, bot.id)), !bots.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted-foreground",
			children: "Make a bot first."
		})]
	});
}
function NewRoom({ onClose }) {
	const [name, setName] = (0, react.useState)("");
	const [chosen, setChosen] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)("");
	const create = (event) => {
		event.preventDefault();
		call("/rooms", "POST", {
			name,
			bots: chosen
		}).then((room) => (reload(), onClose(), (0, _fxbot_app.go)(pathOf(room))), (e) => setError(e.message));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Dialog, {
		open: true,
		onOpenChange: (open) => !open && onClose(),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogContent, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogHeader, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogTitle, { children: "New room" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogDescription, { children: "Bots answer each of your messages once, in the order you pick them." })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
			onSubmit: create,
			className: "grid gap-4",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: "grid gap-1.5 text-sm font-medium",
					children: ["Name", /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Input, {
						value: name,
						onChange: (e) => setName(e.target.value),
						autoFocus: true,
						maxLength: 80
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BotPicker, {
					chosen,
					onChange: setChosen
				}),
				error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "text-sm text-destructive",
					children: error
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogFooter, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					type: "submit",
					disabled: !name.trim() || !chosen.length,
					children: "Make the room"
				}) })
			]
		})] })
	});
}
function RoomsGroup() {
	const list = useRooms();
	const [making, setMaking] = (0, react.useState)(false);
	const { setOpenMobile } = _fxbot_app.ui.useSidebar();
	const open = (event, room) => {
		if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		setOpenMobile(false);
		(0, _fxbot_app.go)(pathOf(room));
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.SidebarGroup, { children: [
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarGroupLabel, { children: "Rooms" }),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarGroupAction, {
			title: "New room",
			"aria-label": "New room",
			onClick: () => setMaking(true),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Plus, {})
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarMenu, { children: list?.map((room) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarMenuItem, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.SidebarMenuButton, {
			asChild: true,
			isActive: location.pathname === pathOf(room),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
				href: pathOf(room),
				onClick: (event) => open(event, room),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "truncate",
					children: room.name
				})
			})
		}) }, room.id)) }),
		list?.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "px-2 text-xs text-muted-foreground",
			children: "Talk with several bots at once."
		}),
		making && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NewRoom, { onClose: () => setMaking(false) })
	] });
}
function EditRoom({ room, onClose }) {
	const [chosen, setChosen] = (0, react.useState)(room.members);
	const [error, setError] = (0, react.useState)("");
	const save = () => call(`/rooms/${room.id}/members`, "PUT", { bots: chosen }).then(() => (reload(), onClose()), (e) => setError(e.message));
	const remove = () => confirm(`Delete ${room.name} and what was said in it?`) && call(`/rooms/${room.id}`, "DELETE").then(() => (reload(), onClose(), (0, _fxbot_app.go)("/")), (e) => setError(e.message));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Dialog, {
		open: true,
		onOpenChange: (open) => !open && onClose(),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogContent, { children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogHeader, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogTitle, { children: room.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.DialogDescription, { children: "Who's in the room, in the order they answer." })] }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BotPicker, {
				chosen,
				onChange: setChosen
			}),
			error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "text-sm text-destructive",
				children: error
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_fxbot_app.ui.DialogFooter, {
				className: "gap-2",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					variant: "ghost",
					className: "text-destructive",
					onClick: remove,
					children: "Delete room"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					onClick: save,
					children: "Save"
				})]
			})
		] })
	});
}
function useRoom(id) {
	const [state, setState] = (0, react.useState)(null);
	const [error, setError] = (0, react.useState)("");
	(0, react.useEffect)(() => {
		const stop = new AbortController();
		const apply = (event) => setState((now) => {
			if (event.type === "room") return {
				room: event.room,
				messages: event.messages,
				replying: event.replying
			};
			if (!now) return now;
			if (event.type === "message") {
				const messages = now.messages.some((m) => m.id === event.message.id) ? now.messages : [...now.messages, event.message];
				return {
					...now,
					messages,
					replying: now.replying?.bot === event.message.author ? null : now.replying
				};
			}
			if (event.type === "reply") return {
				...now,
				replying: {
					bot: event.bot,
					text: event.text
				}
			};
			if (event.type === "idle") return {
				...now,
				replying: null
			};
			return now;
		});
		(async () => {
			while (!stop.signal.aborted) {
				try {
					const res = await (0, _fxbot_app.api)(`/rooms/${id}/stream`, { signal: stop.signal });
					if (!res.ok) {
						setError((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
						return;
					}
					setError("");
					const reader = res.body.getReader();
					const decoder = new TextDecoder();
					let rest = "";
					for (;;) {
						const { value, done } = await reader.read();
						if (done) break;
						const parts = (rest + decoder.decode(value, { stream: true })).split("\n");
						rest = parts.pop();
						for (const part of parts) if (part) apply(JSON.parse(part));
					}
				} catch {
					if (stop.signal.aborted) return;
				}
				await new Promise((resolve) => setTimeout(resolve, 2e3));
			}
		})();
		return () => stop.abort();
	}, [id]);
	return {
		state,
		error
	};
}
function Said({ message, bot }) {
	if (message.author === "note") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "text-center text-xs text-muted-foreground",
		children: message.text
	});
	if (message.author === "owner") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "flex justify-end",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Bubble, {
			align: "end",
			variant: "muted",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.BubbleContent, {
				className: "whitespace-pre-wrap",
				children: message.text
			})
		})
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "flex items-start gap-3",
		children: [bot ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
			shape: bot.shape,
			color: bot.color,
			size: 28,
			className: "shrink-0"
		}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "grid min-w-0 flex-1 grid-cols-1 gap-1 wrap-break-word",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "text-sm font-medium",
				children: bot?.name ?? "A bot that's gone"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Streamdown, { children: message.text })]
		})]
	});
}
function RoomScreen({ params }) {
	const id = Number(params.id);
	const bots = (0, _fxbot_app.useBots)() ?? [];
	const botOf = (id) => bots.find((bot) => bot.id === id);
	const { state, error } = useRoom(id);
	const [draft, setDraft] = (0, react.useState)("");
	const [problem, setProblem] = (0, react.useState)("");
	const [editing, setEditing] = (0, react.useState)(false);
	const end = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		end.current?.scrollIntoView({ block: "end" });
	}, [state?.messages.length, state?.replying?.text]);
	const send = (event) => {
		event.preventDefault();
		const text = draft.trim();
		if (!text) return;
		setDraft("");
		call(`/rooms/${id}/messages`, "POST", { text }).then(() => setProblem(""), (e) => (setProblem(e.message), setDraft(text)));
	};
	const room = state?.room;
	const writer = state?.replying && botOf(state.replying.bot);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "flex h-full min-h-0 flex-col",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Header, {
				title: room?.name ?? "Room",
				children: room && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1",
					children: [room.members.map((member) => {
						const bot = botOf(member);
						return bot ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
							shape: bot.shape,
							color: bot.color,
							size: 24,
							busy: state.replying?.bot === member
						}, member) : null;
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => setEditing(true),
						children: "Edit"
					})]
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
				className: "min-h-0 flex-1 overflow-y-auto",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "mx-auto grid w-full max-w-3xl grid-cols-1 gap-5 px-4 py-4",
					children: [
						error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "text-sm text-destructive",
							children: error
						}),
						state?.messages.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "text-center text-sm text-muted-foreground",
							children: "Say something, and each bot here answers in turn."
						}),
						state?.messages.map((message) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Said, {
							message,
							bot: botOf(message.author)
						}, message.id)),
						state?.replying && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "flex items-start gap-3",
							"data-replying": true,
							children: [writer ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Blob, {
								shape: writer.shape,
								color: writer.color,
								size: 28,
								busy: true,
								className: "shrink-0"
							}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "grid min-w-0 flex-1 grid-cols-1 gap-1 wrap-break-word",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "text-sm font-medium",
									children: writer?.name ?? "A bot"
								}), state.replying.text ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Streamdown, { children: state.replying.text }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "animate-pulse text-muted-foreground",
									children: "Thinking…"
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { ref: end })
					]
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				onSubmit: send,
				className: "mx-auto flex w-full max-w-3xl items-end gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Textarea, {
					"aria-label": "Message the room",
					rows: 1,
					className: "max-h-48 min-h-10 flex-1 resize-none rounded-2xl",
					placeholder: room ? `Message ${room.name}` : "Loading…",
					value: draft,
					onChange: (e) => setDraft(e.target.value),
					onKeyDown: (e) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && send(e)
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_fxbot_app.ui.Button, {
					type: "submit",
					disabled: !draft.trim(),
					children: "Send"
				})]
			}),
			problem && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "px-4 pb-2 text-center text-sm text-destructive",
				children: problem
			}),
			editing && room && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditRoom, {
				room,
				onClose: () => setEditing(false)
			})
		]
	});
}
function setup(app) {
	app.sidebar(RoomsGroup);
	app.route("/rooms/:id", RoomScreen);
}
module.exports = setup;
