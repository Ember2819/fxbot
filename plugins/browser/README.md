# browser

A plugin for [fxbot](https://fxbot.sh): a web browser on each bot's [computer](../computer), Chromium, driven with [agent-browser](https://github.com/vercel-labs/agent-browser).

It has no code. It needs the computer plugin, and gives it two setup steps, which every bot's computer gets the next time it starts:
- agent-browser v0.41.1's Linux binary, for amd64 or arm64, checked against its sha256
- Debian's `chromium`, which agent-browser finds by name, and a font

The `browser` skill tells bots how to use it: open a page, read it as refs, act on them, take a screenshot and look at it with `computer_read_file`, and share it with `computer_to_library`.

Add it from **Plugins**, after the computer. The image grows to about 960 MB, once for all bots, and a page open in a computer holds about 200 MB of its memory.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name and version, and the setup steps it gives the computer |
| `skills/browser/SKILL.md` | How bots use the browser |
