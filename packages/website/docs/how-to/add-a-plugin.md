# Add a plugin

Add a plugin to change fxbot itself: a plugin can add a screen, a group in the sidebar, tools and skills for bots, and settings of its own. fxbot's own plugins are listed in **Add-ons**, and any plugin on GitHub can be added by its repository.

A plugin runs inside fxbot, with everything fxbot can reach. Read what it runs before you add it.

1. Open **Add-ons**, the puzzle button at the bottom of the sidebar, and choose the **Plugins** tab. fxbot's own plugins are listed, tagged **fxbot**.
2. Choose one to open its page. For another plugin, type its repository under **From GitHub**, as `owner/repo`, or `owner/repo/folder` when it's in a folder, and choose **Look**.
3. fxbot reads the repository at its newest commit, and the page shows:
   - **Runs inside fxbot**: its server code and its page code. Choose **Read** to see each file.
   - its settings, the tables it makes, and the skills and MCP servers it carries
   - the repository and commit it comes from
4. Choose the **Add** button, which names the plugin. fxbot shows it under **Installed**, and what it adds to the app shows at once.
5. To change its settings, choose the pencil button on its row. A secret setting is sealed, and the page never shows it again.
6. To give its tools and skills to some bots only, choose **Choose** under **Bots**, and switch it on for each bot that should have them. Its screens are for everyone.

## fxbot's plugins

- **chat-rooms**: rooms where several of your bots talk with you. Choose **+** beside **Rooms** in the sidebar, name the room, and pick its bots in the order they answer. Each of your messages gets one answer from each bot, in turn, and each bot sees what the others said.
- **herdr**: bots see the coding agents [herdr](https://herdr.dev) runs, and read what their panes show. Its **socket** setting says where herdr's socket is. In a release, fxbot's container can't reach that socket by itself: its [README](https://github.com/iammrduncan/fxbot/tree/main/plugins/herdr#reach-herdrs-socket) shows how to let it.

## When it goes differently

- **Its row says Off, with a reason.** Its code failed to load, or its folder is gone. The rest of fxbot runs. The plugin's settings show its log.
- **Its row says Update available.** Its files changed in its repository. Open it with the pencil button and choose **Update to**: fxbot shows what changes, with the code to read, and moves only when you choose **Update**. If the new version doesn't load, the old one keeps running.
- **A server it carries isn't added.** A plugin's remote MCP servers are added as MCP servers of their own, under the same rules as any other: from GitHub, an address on this machine or your network isn't added. Its log says why. A server that runs a command on this machine isn't used yet.
- **A file is passed over.** Files over 2 MiB, and files that aren't text, aren't kept.

**Remove**, in its settings, runs the plugin's own cleanup, then removes its tables, its settings, its files, and the servers it added.

To write a plugin, see [Write a plugin](/sdk/how-to/write-a-plugin/) in the SDK's pages.
