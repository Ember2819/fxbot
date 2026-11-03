# Permissions

libfx has no permission system. Its docs say libfx orders the calls but grants nothing itself, and CLI permission prompts do not apply to libfx tools; the host must authorize inside each tool's `execute()`. The fx CLI has modes. libfx does not.

fxbot needs a permission mode, set per profile and changeable during a session. The modes are ask (ask before any tool use), auto (safe tools run directly; risky ones go to a reviewer model first, which checks for prompt injection or malicious behavior), and yolo (run everything, with no checks).

When a tool call needs approval — any call in ask mode, or anything the auto-mode reviewer flags or cannot finish reviewing — the PWA asks the user: Approve once, Approve always (a remembered allow rule for that tool or action), or Deny. A denial goes back to the model as a failed tool result with the reason.

This follows the fx CLI modes (ask / auto / full-access) and reviewer models documented at https://fx.sh/docs/configure-fx/permissions, and libfx host tools at https://fx.sh/docs/lib/tools. The libfx API exposes `permission.start` / `permission.end` and `wait.start` / `wait.end` events; whether those can be used for this is unverified. Keep it a thin wrapper around every tool's `execute()`, under the simplicity rule.

**Add-on, on a core hook.** The hook before every tool call, which can block it, is part of the [plugin API](../_completed/phases/plugins.md), and core tools pass through it too. Ask, auto, and yolo are a plugin on that hook. The rule built with [MCP servers](../_completed/phases/mcp.md), that bots get only a server's read-only tools until the owner allows more, stays in core.

Not planned yet.
