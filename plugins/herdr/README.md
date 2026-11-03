# herdr

A plugin for [fxbot](https://fxbot.sh): bots see the coding agents [herdr](https://herdr.dev) runs, and read what their panes show.

- `herdr_list_agents` lists herdr's agents: each one's pane, which agent it is, its status, and its folder. The chat shows the list as a table.
- `herdr_read_pane` reads a pane's recent lines.
- The `herdr` skill tells bots when to use them.

Both tools only read. Neither types into a pane.

Add it from **Plugins**, where fxbot's list has it. It runs inside fxbot: read its code there before you add it.

## Reach herdr's socket

The plugin talks to herdr through herdr's socket, `~/.config/herdr/herdr.sock` for herdr's user. Its **socket** setting, in the plugin's settings in **Plugins**, says where fxbot finds it.

**In a checkout** that runs as herdr's own user, the default works.

**In a release**, fxbot runs in its container as the `fxbot` user. The container sees no folder of the machine but its own, and herdr's socket is its user's alone. A relay, run by root, offers the socket to the `fxbot` user inside fxbot's data folder, which the container sees:

```sh
sudo socat UNIX-LISTEN:/var/lib/fxbot/data/herdr.sock,fork,user=fxbot,mode=600 UNIX-CONNECT:/home/<you>/.config/herdr/herdr.sock
```

Keep it running, as a systemd service or in a pane of its own, and set the plugin's **socket** to `/var/lib/fxbot/data/herdr.sock`.

herdr's socket also takes keystrokes for its panes. This plugin only reads, but the relay gives the socket to fxbot's container, where every plugin runs with everything fxbot can reach.

## Files

| File | What it is |
| --- | --- |
| `plugin.json` | Its name, version, parts, and the socket setting |
| `fxbot/server.ts` | The two tools, and the socket client |
| `fxbot/page.jsx` | How a `herdr_list_agents` call shows in the chat |
| `fxbot/page.js` | `page.jsx`, built |
| `skills/herdr/SKILL.md` | When bots use the tools |

## Build the page

`page.js` is `page.jsx` bundled with [rolldown](https://rolldown.rs), which comes with fxbot's packages. Run this in this folder, in a checkout of fxbot, after changing `page.jsx`:

```sh
npx rolldown fxbot/page.jsx --format cjs -e react -e react/jsx-runtime -e @fxbot/app --file fxbot/page.js
```
