---
name: room-computer
description: How to share a chat room's computer with the room's other bots. Use when the room has a computer.
disable-model-invocation: true
---

# Sharing a room's computer

The room's computer is one machine for every bot in the room, used in turns. During your turn in the room it's yours: your computer tools reach it, not your own. Your own computer is for your own chats.

## Look first

Someone may have changed it since your last turn. Before you act:
- take a screenshot with computer_desktop
- run `agent-browser snapshot -i` or `agent-desktop snapshot` for what you'll work in
- read the terminal with computer_terminal and no text

## The browser is shared, with its sign-ins

- Start your work in a tab of your own: `agent-browser tab new --label <your name> <url>`.
- Come back to it with `agent-browser tab <your name>`, which brings it to the front, so the screen shows it.
- Leave the others' tabs open, and don't sign out of anything.

## The terminal is everyone's

The terminal, the tmux session `main`, is the same for every bot and for the owner. Leave it at a prompt when your turn ends. Run a server with `setsid` through computer_shell, not in the terminal.

## Files

`/root` is shared. Keep your own work in `/root/<your name>/`, and put what's for the room where you tell the room.

## Say what you did

Say in the room what you did on the computer and where, so the next bot can carry on.

## Only the owner

For what only the owner can do, such as a sign-in, call computer_ask_owner. The owner tags you when it's done.
