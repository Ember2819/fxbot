# Conventions

Simplicity over complexity, small over huge, light over heavy, and performance over other things. A smaller solution that does the job beats a rule carried over from an older design.

## Core or plugin

fxbot is a small core that every install runs, and plugins that each owner adds if they want them. Like [Pi](https://github.com/earendil-works/pi), "a minimal, extensible agent harness", the core stays small so that plugins can make fxbot what each owner wants. Before building a feature, ask: is this core, or a plugin? The default answer is plugin. Say which in the feature's phase doc, and why.

A feature is core only when it is one of these:
- **What every bot needs:** a model, its instructions, a chat that lasts, its files, its memory, and context that fits the model.
- **What plugins plug into:** what a plugin can carry (code, MCP servers, and skills), finding, vetting, adding, and updating plugins, and the plugin API.
- **What fxbot needs to run:** install, updates, migrations, and sealed secrets.

Everything else is a plugin. A knowledge graph, chat rooms, web search, a password manager, and herdr are plugins.

Plugins are real extensions of the app, not features bolted on beside it. The plugin API ([plugins](docs/_completed/phases/plugins.md), built in 0.4.0) lets a plugin change core behavior as well as add its own:
- hook into a bot's turns and tool calls: change a message before it runs, a bot's instructions, or a tool's input or result, or block a call
- add tools, server routes, and data of its own
- add to the app: a screen, a sidebar entry, a button in the message box, a way to show a message, or a panel in Settings
- start a bot's turn, for a schedule, an event, or another bot

The rules:
- When a plugin can't do what it needs, widen the plugin API with the smallest hook or place in the app that it needs. Don't build the feature in core. Add a hook when a real plugin needs it, not before.
- Build core features so plugins can change them: core behavior runs through the same hooks plugins get.
- A plugin that isn't added costs nothing: no process, no timer, no request, no table, no code in the page, and no space in the app.
- A plugin's data lives in its own tables or files, which it creates and removes. Never in a core migration.
- The core never imports or names a particular plugin. fxbot's lists name the plugins it suggests, as data.
- fxbot's own plugins use the same plugin API as anyone's. If one needs a shortcut into core, the API is missing a hook.
- Removing a plugin leaves the core working.

## Code

- Keep files small and on one job. Split a file when it is hard to read in one sitting.
- Prefer few dependencies. Each one needs a reason. Use Node and the browser before adding a package.
- Keep what every owner waits on fast: loading the page, sending a message, and streaming a reply. Say what a change adds to those in requests, work, or page weight.
- Do not add an abstraction before a second real use. A few duplicated lines are fine.
- Write plain TypeScript. Skip classes, generic frameworks, and wrappers unless a library requires them.
- Delete unused code before adding more. Do not leave speculative hooks, options, or empty layers.
- Name things for what they are. Comment only where the next reader would otherwise guess wrong.
- Check outside input at the edge that receives it. One check is enough.
- Test behavior that can break, against disposable data. Skip a new test harness for a one-line change.
- Stay four packages (sdk, server, ui, and website, the public site), one fxbot server process, and Postgres until a real limit says otherwise. A new package needs a second real consumer.
- Keep records in Postgres, one statement or one transaction per change, so concurrent requests never interleave a read-modify-write. Store calls are async.
- Never store a secret in plain text: seal it in the SDK, so Postgres holds only ciphertext.
