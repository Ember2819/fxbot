# Permissions

libfx has no permission system. Its docs say libfx orders the calls but grants nothing itself, and CLI permission prompts do not apply to libfx tools; the host must authorize inside each tool's `execute()`. The fx CLI has modes. libfx does not.

fxbot needs a permission mode, set per profile and changeable during a session. The modes are ask (ask before any tool use), auto (safe tools run directly; risky ones go to a reviewer model first, which checks for prompt injection or malicious behavior), and yolo (run everything, with no checks).

When a tool call needs approval — any call in ask mode, or anything the auto-mode reviewer flags or cannot finish reviewing — the PWA asks the user: Approve once, Approve always (a remembered allow rule for that tool or action), or Deny. A denial goes back to the model as a failed tool result with the reason.

This follows the fx CLI modes (ask / auto / full-access) and reviewer models documented at https://fx.sh/docs/configure-fx/permissions, and libfx host tools at https://fx.sh/docs/lib/tools. The libfx API exposes `permission.start` / `permission.end` and `wait.start` / `wait.end` events; whether those can be used for this is unverified. Keep it a thin wrapper around every tool's `execute()`, under the simplicity rule.

**Plugin, on a core hook.** The hook before every tool call, which can block it, is part of the [plugin API](../_completed/phases/plugins.md), and core tools pass through it too. Ask, auto, and yolo are a plugin on that hook. The rule built with [MCP servers](../_completed/phases/mcp.md), that bots get only a server's read-only tools until the owner allows more, stays in core.

## When no one is there to answer

Some work starts without the owner: a [routine](../_completed/phases/routines.md), a trigger, or [a message from another bot](cross-bot-messaging.md). An approval it raises can't wait for ever, and the turn holding it holds the bot's chat. Grok Bot's rules are the ones to follow ([approvals](https://docs.x.ai/grok-bot/approvals-security-and-privacy) and [security](https://docs.x.ai/grok-bot/security), read on 2026-11-05):
- **Work from a chat the owner is in waits.** "When the work started from a chat message, the card waits for an answer and doesn't expire on a timer."
- **Work that started without them expires.** "When a routine, an incoming message, or other background work raised the card, it expires after 30 minutes."
- **An expired approval is a no.** "A closed card shows **Expired** and says the Bot didn't do the action." The call fails, with that reason.
- **It can still teach.** "If the card offered a rule, you can still press **Always allow next time**; the Bot saves the rule and can go ahead the next time."
- **A new message closes it.** "If you send a new message instead of answering, any open card in that chat closes, and changing your Auto Review settings also closes open cards."
- **A denial sticks for the turn.** "**Deny** stops the action; the Bot does not try it again until the member sends another message."
- **External actions wait as drafts.** Email from "a routine, an incoming message, or other work you didn't start with that request waits as a draft until you press **Send**."

In fxbot, what started a turn is known: its `messageId`, which `tool.before` carries, and `from` on `turn.start`. So 30 minutes is a setting of this plugin, and a turn's origin decides whether an approval expires. It needs a way to reach the owner, since the card sits in a chat they may not have open.

Not planned yet.
