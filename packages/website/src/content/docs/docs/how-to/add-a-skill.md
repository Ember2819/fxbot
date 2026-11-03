---
title: "Add a skill"
description: "Give your bots a skill: instructions for a kind of task, which a bot reads only when a task calls for them. A skill is a plugin that carries one skill. It comes from fxbot's own picks or, with unvetted plugins on, from skills.sh, and installs from its GitHub repository."
---

Give your bots a skill: instructions for a kind of task, which a bot reads only when a task calls for them. A skill is a plugin that carries one skill. It comes from fxbot's own picks or, with unvetted plugins on, from [skills.sh](https://skills.sh), and installs from its GitHub repository.

1. Open **Plugins**, the puzzle button at the bottom of the sidebar, and choose **Browse**. fxbot's picks are listed first, tagged **fxbot**: a skill says **Skill** beside its name.
2. To find another, turn on **Show unvetted plugins** in Settings, then type in the search above the tabs. Results under **Skills** come from skills.sh, with how many times each was installed.
3. Choose a skill to open its page. fxbot reads its repository and shows its description, its files, the repository and commit it comes from, and its license. Choose **Read** to see its `SKILL.md`.
4. Choose the **Add** button, which names the skill. fxbot shows it under **Installed**, for all bots.
5. To give it to some bots only, choose the pencil button on its row, then **Choose** under **Bots**, and switch it on for each bot that should have it.

Each bot sees a short list of its skills, and reads one when a task matches it. In the chat, that shows as **Read a skill**, with the skill's name.

## Use a skill in a message

To be sure a bot uses a skill, name it. In the chat, type `$`, or `/` at the start of the message, and pick the skill from the list; it shows as a chip above your message. Typing more narrows the list, and `$fd` finds `frontend-design`. You can also type `$show-me` yourself. The skill goes with the message, so the bot has it before it answers.

## When it goes differently

- **The page says it can't be added.** The skill's `SKILL.md` lacks a name or a description, or breaks the [Agent Skills](https://agentskills.io/specification) limits. The page says which.
- **The page says it is only called by name.** Its author meant a person to start it, as `show-me` is. Bots don't see it in their list: type `$show-me` in your message, or pick it after `$`.
- **A file is passed over.** Images, links, and files over 256 KiB aren't kept. Bots read only text.
- **Its row says Update available.** The skill's files changed in its repository. Open it with the pencil button and choose **Update to**: fxbot shows which files changed, and moves only when you choose **Update**.
- **The search shows nothing from skills.sh.** Turn on unvetted plugins in Settings, and type 2 characters or more. Each search then sends its words to skills.sh.

Nothing in a skill runs: bots read its scripts as text. Why that matters: see [Security model](/docs/explanation/security/#skills).
