---
name: desktop
description: Use for a desktop app on your computer, such as a file manager or an editor, and its windows, buttons, menus, and fields, with the agent-desktop command and its accessibility trees.
---

# Desktop apps

Run `agent-desktop skills get desktop` through `computer_shell`, and follow what it prints: it matches the agent-desktop on your computer.

On your computer:
- Start apps with `agent-desktop launch`, and Chromium only through `agent-browser`.
- For a web page, use `agent-browser`, not agent-desktop: its refs are the page's own.
- Wait for an app's window before you take a snapshot.
- For the terminal window, use `computer_terminal`, not agent-desktop.
- For what has no tree, such as a canvas, use `computer_desktop`.
