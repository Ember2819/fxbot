---
title: "Add a plugin"
description: "A plugin gives your bots more, or changes fxbot itself. It carries any mix of three things: - skills: instructions for a kind of task, which a bot reads when a task calls for them - MCP servers: tools from a remote service - code, which runs inside fxbot and can add a screen, a group in the sidebar, tools, and settings of its own"
---

A plugin gives your bots more, or changes fxbot itself. It carries any mix of three things:
- **skills**: instructions for a kind of task, which a bot reads when a task calls for them
- **MCP servers**: tools from a remote service
- **code**, which runs inside fxbot and can add a screen, a group in the sidebar, tools, and settings of its own

By default, fxbot shows only the plugins it vets, tagged **fxbot**.

1. Open **Plugins**, the puzzle button at the bottom of the sidebar, and choose **Browse**. fxbot's picks are listed, each with what it carries beside its name.
2. Choose one to open its page. fxbot reads it at its newest version, and the page shows what it carries. For code, under **Runs inside fxbot**, choose **Read** to see each file: code runs with everything fxbot can reach.
3. Choose the **Add** button, which names the plugin. fxbot shows it under **Installed**, with what it carries, and what it adds to the app shows at once.
4. To change its settings, choose the pencil button on its row. A secret setting is sealed, and the page never shows it again. A plugin's MCP servers are listed there too, each with its own sign-in or key and tools.
5. To give it to some bots only, choose **Choose** under **Bots**, and switch it on for each bot that should have it. Its servers follow, and its screens are for everyone.

## A plugin that needs another

Some plugins build on another, such as one that installs programs on the computer. Its page says **Needs computer**, and **Add** waits until the computer is added. While it's added, the computer can't be removed. A bot that has it on and the computer off says **Needs computer on this bot** in its settings: switch the computer on for it too.

## Show unvetted plugins

fxbot's picks are the plugins it vets. To see the rest, open **Settings**, and under **Plugins**, turn on **Show unvetted plugins**. **Browse** then adds:
- MCP servers from GitHub's registry, with **Search everything** for the official one, and **Add by address**: see [Add an MCP server](/docs/how-to/add-an-mcp-server/)
- skills from skills.sh: see [Add a skill](/docs/how-to/add-a-skill/)
- **From GitHub**: any plugin with a `plugin.json`, by its repository, as `owner/repo`, or `owner/repo/folder` when it's in a folder

fxbot doesn't vet any of these. Read what each one does before you add it. While the switch is off, fxbot asks none of those registries, and adds nothing but its picks. Plugins already installed keep working either way.

## fxbot's plugins

- **chat-rooms**: rooms where several of your bots talk with you. Tag a bot with `@` to ask it, and bots hand work to each other by tagging: see [Talk with several bots in a room](/docs/how-to/talk-in-a-room/).
- **computer**: a Linux computer for each bot, with a desktop you watch and take over, a terminal, a web browser, and files. Its engine is set up once on the machine: see [Give bots a computer](/docs/how-to/give-bots-a-computer/).
- **herdr**: bots see the coding agents [herdr](https://herdr.dev) runs, and read what their panes show. Its **socket** setting says where herdr's socket is. In a release, fxbot's container can't reach that socket by itself: its [README](https://github.com/iammrduncan/fxbot/tree/main/plugins/herdr#reach-herdrs-socket) shows how to let it.

## When it goes differently

- **Its row says Off, with a reason.** Its code failed to load, or its folder is gone. The rest of fxbot runs. The plugin's settings show its log.
- **Its row says Update available.** Its files changed in its repository. Open it with the pencil button and choose **Update to**: fxbot shows what changes, with the code to read, and moves only when you choose **Update**. If new code doesn't load, the old version keeps running.
- **A server it carries isn't added.** A plugin's remote MCP servers are added with it, under the same rules as any other server: from GitHub, an address on this machine or your network isn't added. Its log says why. A server that runs a command on this machine isn't used yet.
- **A file is passed over.** Files over 2 MiB, and files that aren't text, aren't kept.

**Remove**, in its settings, runs the plugin's own cleanup, then removes its tables, its settings, its files, and the servers it added.

To write a plugin, see [Write a plugin](/sdk/how-to/write-a-plugin/) in the SDK's pages.
