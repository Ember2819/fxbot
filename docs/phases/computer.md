# Agent computer

A computer that bots use during a turn: a shell, files, and installed programs, apart from fxbot's own files. It unlocks the add-ons that need one, such as computer use, an agent desktop, a browser, local (stdio) MCP servers, and skills that run scripts. From [issue #6](https://github.com/iammrduncan/fxbot/issues/6).

libfx gives an agent no shell or files of its own: its docs say the native backend doesn't turn on fx's built-in shell or file tools, and that libfx grants nothing itself. So the computer's tools are fxbot host tools, which a plugin can add.

**Add-on: a plugin that other plugins build on.** Many bots need no computer: chat, the library, MCP servers, and skills work without one, and a computer costs memory and disk while it runs. The core's own tools reach only its own data (`chat_history`, the library's tools, `skill`, and later memories). A shell, files on a machine, and a browser are add-ons. A plugin that needs a computer says so, and runs its programs there. Plugins that don't, such as chat rooms and herdr, never start one. When this is built, the [plugin API](plugins.md) gains the smallest piece it needs: a plugin that names another plugin it needs, and a way to reach it. The core never names the computer plugin.

Open questions:
- One computer shared by all bots, or one per bot. Resource use decides. One per bot, started when a bot first needs it and stopped when it sits idle, costs nothing in between.
- What a plugin installs on the computer, and how: setup steps, packages, and local MCP servers, which the [plugins](plugins.md#not-in-this-phase) phase left out.

Not planned yet.
